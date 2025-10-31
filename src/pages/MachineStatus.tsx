import React, { useState, useEffect, useCallback, useRef } from "react";
import { useCookies } from "react-cookie";
import io, { Socket } from "socket.io-client";
import {
  Box,
  Text,
  Flex,
  VStack,
  HStack,
  Badge,
  Select,
  useToast,
  Button,
  Card,
  CardBody,
  Heading,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  SimpleGrid,
} from "@chakra-ui/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Activity } from "lucide-react";

const MachineStatus: React.FC = () => {
  const [cookies] = useCookies();
  const toast = useToast();
  const [machineData, setMachineData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<string>("all");
  const [selectedShift, setSelectedShift] = useState<string>("all");
  const [selectedDesign, setSelectedDesign] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  // const [timeRange, setTimeRange] = useState<string>('1h');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(30); // seconds

  const backendUrl =
    process.env.REACT_APP_BACKEND_URL || "http://localhost:8096/api/";
  const MACHINE_STATUS_POST_URL = `${backendUrl}machine-status/save-machine-status`;
  const MACHINE_STATUS_GET_URL = `${backendUrl}machine-status/get-all-machine-status`;

  // Socket ref for real-time updates
  const socketRef = useRef<Socket | null>(null);

  // POST function to save machine status to database
  const postMachineStatus = async (data: any) => {
    try {
      const response = await fetch(MACHINE_STATUS_POST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cookies?.access_token || ""}`,
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to save machine status");
      }

      const result = await response.json();
      console.log("Machine status saved successfully:", result);

      return result;
    } catch (err) {
      console.warn("Failed to save machine status", err);
      toast({
        title: "Error",
        description: "Failed to save machine status. Please try again.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const fetchMachineData = useCallback(
    async (deviceId: string = "PC-001") => {
      setIsLoading(true);
      try {
        // Use default device if 'all' is selected
        const actualDeviceId = deviceId === "all" ? "PC-001" : deviceId;

        // Use the machine-data API endpoint
        const response = await fetch(
          `${backendUrl}dashboard/machine-data?device_id=${actualDeviceId}`,
          {
            headers: {
              Authorization: `Bearer ${cookies?.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Transform the API response to match our card structure
            const transformedData = transformMachineData(result.data);
            setMachineData(transformedData);
            setApiSummaryData(result.data); // Store complete API data for summary
            setLastUpdated(new Date());
            toast({
              title: "Success",
              description: "Machine data fetched successfully",
              status: "success",
              duration: 3000,
              isClosable: true,
            });
          } else {
            throw new Error(result.message || "Failed to fetch machine data");
          }
        } else {
          throw new Error("Failed to fetch machine data");
        }
      } catch (error: any) {
        console.error("Error fetching machine data:", error);
        toast({
          title: "Error",
          description: "Failed to fetch machine data. Using sample data.",
          status: "warning",
          duration: 3000,
          isClosable: true,
        });
        // Keep using mock data on error
      } finally {
        setIsLoading(false);
      }
    },
    [cookies?.access_token, toast]
  );

  useEffect(() => {
    // Load machine data from API
    fetchMachineData(selectedMachine);
  }, [selectedMachine, fetchMachineData]);

  // Socket.IO connection for real-time updates
  useEffect(() => {
    // Initialize Socket.IO client
    const socketUrl =
      process.env.REACT_APP_SOCKET_URL ||
      (process.env.REACT_APP_BACKEND_URL || "").replace(/\/api\/?$/, "") ||
      "http://localhost:8085";

    socketRef.current = io(socketUrl, {
      withCredentials: true,
      extraHeaders: {
        Authorization: `Bearer ${cookies?.access_token || ""}`,
      },
    });

    // Join the 'machineStatusDashboard' room
    socketRef.current.emit("joinMachineStatusDashboard");
    console.log("Joined machineStatusDashboard room");

    // Handle machine status updates from backend
    socketRef.current.on("machineStatusUpdate", (data: any) => {
      console.log("Received machine status update:", data);

      // Add new data to the list
      setMachineData((prevData) => {
        const newData = {
          deviceId: data.deviceId || "PC-001",
          timestamp: new Date(
            data.createdAt || data.startTime
          ).toLocaleString(),
          shift: data.shift || "Shift-A",
          design: data.design || "Design123",
          count: data.count || 0,
          efficiency: parseFloat(data.efficiency || 0).toFixed(2),
          error1: data.error1 || 0,
          error2: data.error2 || 0,
          status: data.status || "OFF",
          duration: data.duration || "0h 0m",
        };

        return [newData, ...prevData].slice(0, 100); // Keep last 100 entries
      });

      setLastUpdated(new Date());
    });

    // Cleanup on unmount
    return () => {
      socketRef.current?.disconnect();
    };
  }, [cookies?.access_token]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchMachineData(selectedMachine);
      setLastUpdated(new Date());
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, selectedMachine, fetchMachineData]);

  // Transform API data to match our card structure
  const transformMachineData = (apiData: any) => {
    if (!apiData.complete_status_timeline) return [];

    return apiData.complete_status_timeline.map((item: any, index: number) => ({
      deviceId: apiData.device_id || "PC-001",
      timestamp: item.start_time,
      shift: item.shift || "Shift-A",
      design: item.design || "Design123",
      count: item.count || 0,
      efficiency: parseFloat(item.efficiency || 0).toFixed(2),
      error1: item.error1 || 0,
      error2: item.error2 || 0,
      status: item.status || "OFF",
      duration: item.duration || "0h 0m",
    }));
  };

  // Store API summary data for statistics cards
  const [apiSummaryData, setApiSummaryData] = useState<any>(null);

  // Filter data based on selections
  const filteredData = machineData.filter((item) => {
    if (selectedMachine !== "all" && item.deviceId !== selectedMachine)
      return false;
    if (selectedShift !== "all" && item.shift !== selectedShift) return false;
    if (selectedDesign !== "all" && item.design !== selectedDesign)
      return false;
    if (selectedStatus !== "all" && item.status !== selectedStatus)
      return false;
    return true;
  });

  // Prepare chart data
  const chartData = filteredData.map((item: any) => ({
    time: item.timestamp.split(" ")[1], // Extract time part
    count: item.count,
    efficiency: item.efficiency,
    errors: item.error1 + item.error2,
  }));

  // Get unique values for filters
  const shifts = Array.from(
    new Set(machineData.map((item: any) => item.shift))
  );
  const designs =
    apiSummaryData?.designs ||
    Array.from(new Set(machineData.map((item: any) => item.design)));
  const availableDevices = Array.from(
    new Set(machineData.map((item: any) => item.deviceId))
  );

  return (
    <Box p={6} bg="gray.50" minH="100vh">
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
          <Box>
            <Heading size="lg" color="gray.800" mb={2}>
              Machine Dashboard
            </Heading>
            <Text color="gray.600">
              Monitor real-time machine performance and status
            </Text>
            <Text fontSize="sm" color="gray.500" mt={1}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </Text>
          </Box>
          <HStack spacing={3}>
            <HStack spacing={2}>
              <Text fontSize="sm" color="gray.600">
                Auto Refresh:
              </Text>
              <Badge
                colorScheme={autoRefresh ? "green" : "gray"}
                variant="subtle"
                cursor="pointer"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? "ON" : "OFF"}
              </Badge>
            </HStack>
            <Select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              size="sm"
              w="100px"
              isDisabled={!autoRefresh}
            >
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1m</option>
              <option value={300}>5m</option>
            </Select>
            <Button
              leftIcon={<Activity />}
              colorScheme="blue"
              onClick={() => {
                fetchMachineData(selectedMachine);
                setLastUpdated(new Date());
              }}
              isLoading={isLoading}
              size="sm"
            >
              Refresh Now
            </Button>
            <Button
              colorScheme="green"
              onClick={() => {
                // Send test machine status data
                const testData = {
                  deviceId: "PC-001",
                  status: "ON",
                  shift: "Shift-A",
                  design: "Design123",
                  count: Math.floor(Math.random() * 100),
                  efficiency: (Math.random() * 5).toFixed(2),
                  error1: Math.floor(Math.random() * 5),
                  error2: Math.floor(Math.random() * 3),
                  duration: `${Math.floor(Math.random() * 8)}h ${Math.floor(
                    Math.random() * 60
                  )}m`,
                  temperature: 25 + Math.floor(Math.random() * 10),
                  vibration: Math.random() * 10,
                  powerConsumption: 100 + Math.random() * 50,
                };

                postMachineStatus(testData);

                toast({
                  title: "Test Data Sent",
                  description: "Machine status test data sent to database",
                  status: "info",
                  duration: 2000,
                  isClosable: true,
                });
              }}
              size="sm"
            >
              Send Test Data
            </Button>
          </HStack>
        </Flex>

        {/* Statistics Cards */}
        {/* <HStack spacing={6} wrap="wrap">
          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, blue.50, white)"
            borderColor="blue.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Total Production</StatLabel>
                <StatNumber color="blue.600">
                  {isLoading
                    ? "..."
                    : apiSummaryData?.total_production?.toLocaleString() || "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {isLoading ? "Loading..." : "All Records"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, green.50, white)"
            borderColor="green.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Avg Efficiency</StatLabel>
                <StatNumber color="green.600">
                  {isLoading
                    ? "..."
                    : apiSummaryData?.avg_efficiency
                    ? parseFloat(apiSummaryData.avg_efficiency).toFixed(2)
                    : "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {isLoading ? "Loading..." : "Overall Average"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, red.50, white)"
            borderColor="red.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Total Errors</StatLabel>
                <StatNumber color="red.600">
                  {isLoading ? "..." : apiSummaryData?.total_errors || "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="decrease" />
                  {isLoading ? "Loading..." : "Error1 + Error2"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, purple.50, white)"
            borderColor="purple.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Status Changes</StatLabel>
                <StatNumber color="purple.600">
                  {isLoading
                    ? "..."
                    : apiSummaryData?.status_summary?.total_status_changes ||
                      "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {isLoading ? "Loading..." : "Timeline Events"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </HStack> */}

        {/* Additional Statistics Row */}
        {/* <HStack spacing={6} wrap="wrap" mt={4}>
          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, orange.50, white)"
            borderColor="orange.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Error 1 Count</StatLabel>
                <StatNumber color="orange.600">
                  {isLoading ? "..." : apiSummaryData?.error1_count || "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="decrease" />
                  {isLoading ? "Loading..." : "Type 1 Errors"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, red.50, white)"
            borderColor="red.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Error 2 Count</StatLabel>
                <StatNumber color="red.600">
                  {isLoading ? "..." : apiSummaryData?.error2_count || "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="decrease" />
                  {isLoading ? "Loading..." : "Type 2 Errors"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, green.50, white)"
            borderColor="green.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">ON Cycles</StatLabel>
                <StatNumber color="green.600">
                  {isLoading
                    ? "..."
                    : apiSummaryData?.status_summary?.total_on_cycles || "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {isLoading ? "Loading..." : "Active Cycles"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, gray.50, white)"
            borderColor="gray.200"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">OFF Cycles</StatLabel>
                <StatNumber color="gray.600">
                  {isLoading
                    ? "..."
                    : apiSummaryData?.status_summary?.total_off_cycles || "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="decrease" />
                  {isLoading ? "Loading..." : "Inactive Cycles"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </HStack> */}

        <HStack spacing={6} wrap="wrap">
          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, blue.50, white)"
            borderColor="blue.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Total Machine</StatLabel>
                <StatNumber color="blue.600">
                  {isLoading
                    ? "..."
                    : apiSummaryData?.total_production?.toLocaleString() || "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {isLoading ? "Loading..." : "All Records"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, green.50, white)"
            borderColor="green.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Running Machine</StatLabel>
                <StatNumber color="green.600">
                  {isLoading
                    ? "..."
                    : apiSummaryData?.avg_efficiency
                    ? parseFloat(apiSummaryData.avg_efficiency).toFixed(2)
                    : "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {isLoading ? "Loading..." : "Overall Average"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, red.50, white)"
            borderColor="red.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Stopped Machine</StatLabel>
                <StatNumber color="red.600">
                  {isLoading ? "..." : apiSummaryData?.total_errors || "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="decrease" />
                  {isLoading ? "Loading..." : "Error1 + Error2"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card
            flex="1"
            minW="200px"
            bgGradient="linear(to-br, purple.50, white)"
            borderColor="purple.100"
            variant="outline"
            rounded="lg"
            boxShadow="sm"
            _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
            transition="all 0.2s ease-in-out"
          >
            <CardBody>
              <Stat>
                <StatLabel color="gray.600">Errors in Machine</StatLabel>
                <StatNumber color="purple.600">
                  {isLoading
                    ? "..."
                    : apiSummaryData?.status_summary?.total_status_changes ||
                      "0"}
                </StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {isLoading ? "Loading..." : "Timeline Events"}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </HStack>

        {/* Filters */}
        <Card>
          <CardBody>
            <HStack spacing={4} wrap="wrap">
              <Box>
                <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={2}>
                  Device ID
                </Text>
                <Select
                  value={selectedMachine}
                  onChange={(e) => setSelectedMachine(e.target.value)}
                  size="sm"
                  w="150px"
                >
                  <option value="all">All Devices</option>
                  {availableDevices.map((device: string) => (
                    <option key={device} value={device}>
                      {device}
                    </option>
                  ))}
                </Select>
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={2}>
                  Shift
                </Text>
                <Select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  size="sm"
                  w="150px"
                >
                  <option value="all">All Shifts</option>
                  {shifts.map((shift: string) => (
                    <option key={shift} value={shift}>
                      {shift}
                    </option>
                  ))}
                </Select>
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={2}>
                  Design
                </Text>
                <Select
                  value={selectedDesign}
                  onChange={(e) => setSelectedDesign(e.target.value)}
                  size="sm"
                  w="150px"
                >
                  <option value="all">All Designs</option>
                  {designs.map((design: string) => (
                    <option key={design} value={design}>
                      {design}
                    </option>
                  ))}
                </Select>
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={2}>
                  Status
                </Text>
                <Select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  size="sm"
                  w="150px"
                >
                  <option value="all">All Status</option>
                  <option value="ON">ON</option>
                  <option value="OFF">OFF</option>
                </Select>
              </Box>

              {/* <Box>
                <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={2}>
                  Time Range
                </Text>
                <Select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  size="sm"
                  w="150px"
                >
                  <option value="1h">Last Hour</option>
                  <option value="6h">Last 6 Hours</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                </Select>
              </Box> */}
            </HStack>
          </CardBody>
        </Card>

        {/* Charts */}
        {/* <HStack spacing={6} align="stretch">
          <Card flex="2">
            <CardBody>
              <Heading size="md" mb={4}>
                Count Over Time
              </Heading>
              <Box height="300px">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="time"
                      stroke="#718096"
                      fontSize={12}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      stroke="#718096"
                      fontSize={12}
                      label={{
                        value: "Count",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #E2E8F0",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#3182CE"
                      strokeWidth={2}
                      dot={{ fill: "#3182CE", strokeWidth: 2, r: 4 }}
                      name="Count"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardBody>
          </Card>

          <Card flex="1">
            <CardBody>
              <Heading size="md" mb={4}>
                Efficiency vs Errors
              </Heading>
              <Box height="300px">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="time" stroke="#718096" fontSize={12} />
                    <YAxis stroke="#718096" fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="efficiency"
                      fill="#38A169"
                      name="Efficiency"
                    />
                    <Bar dataKey="errors" fill="#E53E3E" name="Errors" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardBody>
          </Card>
        </HStack> */}

        {/* Machine Performance Data Cards */}
        <Card>
          <CardBody>
            <Heading size="md" mb={4}>
              Machine Performance Data
            </Heading>
            {isLoading ? (
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                {[1, 2, 3].map((i) => (
                  <Card key={i} variant="outline" size="sm">
                    <CardBody p={4}>
                      <Box>
                        <Text
                          fontSize="lg"
                          fontWeight="bold"
                          color="gray.300"
                          mb={3}
                        >
                          Loading...
                        </Text>
                        <Box mb={3}>
                          <Text fontSize="xs" color="gray.300" mb={1}>
                            Timestamp
                          </Text>
                          <Text
                            fontSize="sm"
                            fontWeight="medium"
                            color="gray.300"
                          >
                            Loading...
                          </Text>
                        </Box>
                        <Box mb={3}>
                          <Text fontSize="xs" color="gray.300" mb={1}>
                            Design
                          </Text>
                          <Text
                            fontSize="sm"
                            fontWeight="medium"
                            color="gray.300"
                          >
                            Loading...
                          </Text>
                        </Box>
                        <SimpleGrid columns={2} spacing={3} mb={3}>
                          <Box>
                            <Text fontSize="xs" color="gray.300" mb={1}>
                              Duration
                            </Text>
                            <Text
                              fontSize="lg"
                              fontWeight="bold"
                              color="gray.300"
                            >
                              Loading...
                            </Text>
                          </Box>
                          <Box>
                            <Text fontSize="xs" color="gray.300" mb={1}>
                              Efficiency
                            </Text>
                            <Badge
                              colorScheme="gray"
                              variant="subtle"
                              fontSize="sm"
                            >
                              Loading...
                            </Badge>
                          </Box>
                        </SimpleGrid>
                      </Box>
                    </CardBody>
                  </Card>
                ))}
              </SimpleGrid>
            ) : (
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                {filteredData.map((item: any, index: number) => (
                  <Card
                    key={index}
                    variant="elevated"
                    size="sm"
                    borderLeftWidth="6px"
                    borderLeftColor={
                      item.status === "ON" ? "green.400" : "red.400"
                    }
                    rounded="md"
                    boxShadow="md"
                    _hover={{ boxShadow: "xl", transform: "translateY(-3px)" }}
                    transition="all 0.2s ease-in-out"
                  >
                    <CardBody
                      p={4}
                      bgGradient={
                        item.status === "ON"
                          ? "linear(to-tr, white, green.50)"
                          : "linear(to-tr, white, red.50)"
                      }
                    >
                      {/* Header with Device ID, Status, and Shift */}
                      <Flex justify="space-between" align="center" mb={3}>
                        <Text fontSize="lg" fontWeight="bold" color="blue.700">
                          {item.deviceId}
                        </Text>
                        <VStack spacing={1} align="end">
                          {/* Machine Status ON/OFF with real-time indicator */}
                          <HStack spacing={2}>
                            <Box
                              w={2}
                              h={2}
                              borderRadius="full"
                              bg={
                                item.status === "ON" ? "green.400" : "red.400"
                              }
                              animation={
                                item.status === "ON"
                                  ? "pulse 2s infinite"
                                  : "none"
                              }
                            />
                            <Badge
                              colorScheme={
                                item.status === "ON" ? "green" : "red"
                              }
                              variant="solid"
                              size="sm"
                              borderRadius="full"
                              px={2}
                            >
                              {item.status}
                            </Badge>
                          </HStack>
                          {/* Shift Badge */}
                          <Badge
                            colorScheme={
                              item.shift === "Shift-A"
                                ? "green"
                                : item.shift === "Shift-B"
                                ? "blue"
                                : "purple"
                            }
                            variant="subtle"
                            size="sm"
                          >
                            {item.shift}
                          </Badge>
                        </VStack>
                      </Flex>

                      {/* Timestamp */}
                      <Box mb={3}>
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Timestamp
                        </Text>
                        <Text fontSize="sm" fontWeight="medium">
                          {item.timestamp}
                        </Text>
                      </Box>

                      {/* Design */}
                      <Box mb={3}>
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Design
                        </Text>
                        <Text fontSize="sm" fontWeight="medium">
                          {item.design}
                        </Text>
                      </Box>

                      {/* Performance Metrics */}
                      <SimpleGrid columns={2} spacing={3} mb={3}>
                        <Box>
                          <Text fontSize="xs" color="gray.500" mb={1}>
                            Duration
                          </Text>
                          <Text
                            fontSize="lg"
                            fontWeight="bold"
                            color="blue.600"
                          >
                            {item.duration || "0h 0m"}
                          </Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color="gray.500" mb={1}>
                            Efficiency
                          </Text>
                          <Badge
                            colorScheme={
                              item.efficiency >= 4
                                ? "green"
                                : item.efficiency >= 3
                                ? "yellow"
                                : "red"
                            }
                            variant="solid"
                            fontSize="sm"
                            rounded="full"
                            px={2}
                          >
                            {parseFloat(item.efficiency || 0).toFixed(2)}
                          </Badge>
                        </Box>
                      </SimpleGrid>

                      {/* Error Metrics */}
                      <Box>
                        <Text fontSize="xs" color="gray.500" mb={2}>
                          Error Status
                        </Text>
                        <HStack spacing={2}>
                          <Box textAlign="center">
                            <Text fontSize="xs" color="gray.500">
                              Error 1
                            </Text>
                            <Badge
                              colorScheme={item.error1 === 0 ? "green" : "red"}
                              variant="solid"
                              size="sm"
                            >
                              {item.error1}
                            </Badge>
                          </Box>
                          <Box textAlign="center">
                            <Text fontSize="xs" color="gray.500">
                              Error 2
                            </Text>
                            <Badge
                              colorScheme={item.error2 === 0 ? "green" : "red"}
                              variant="solid"
                              size="sm"
                            >
                              {item.error2}
                            </Badge>
                          </Box>
                        </HStack>
                      </Box>
                    </CardBody>
                  </Card>
                ))}
              </SimpleGrid>
            )}
          </CardBody>
        </Card>
      </VStack>
    </Box>
  );
};

export default MachineStatus;
