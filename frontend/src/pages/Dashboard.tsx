



import React, { useEffect, useState } from "react";
import { Navigation } from "../components/ui/navigation";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Link } from "react-router-dom";
import {
  Heart,
  Activity,
  Moon,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Phone,
} from "lucide-react";
import { API } from "../api/api";

interface HealthBucket {
  _id: string;
  avgHeartRate?: number;
  avgSleepDuration?: number;
  totalSteps?: number;
}

interface BucketGroup {
  totalHeartRate: number;
  totalSleep: number;
  totalSteps: number;
  countBuckets: number;
}

interface RealtimeReading {
  heart_rate: number;
  blood_pressure?: { systolic: number; diastolic: number };
  steps: number;
  timestamp: string;
}

interface DailyReading {
  sleep?: { duration: number };
}

// ----------------- Helper Functions -----------------

// Group buckets by month (YYYY-MM)
function groupByMonth(data: HealthBucket[]) {
  const groups: Record<string, BucketGroup> = {};

  data.forEach((item) => {
    const date = new Date(item._id);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;

    if (!groups[key]) {
      groups[key] = {
        totalHeartRate: 0,
        totalSleep: 0,
        totalSteps: 0,
        countBuckets: 0,
      };
    }

    groups[key].totalHeartRate += item.avgHeartRate || 0;
    groups[key].totalSleep += item.avgSleepDuration || 0;
    groups[key].totalSteps += item.totalSteps || 0;
    groups[key].countBuckets++;
  });

  return groups;
}

// Group buckets by quarter
function groupByQuarter(data: HealthBucket[]) {
  const groups: Record<string, BucketGroup> = {};

  data.forEach((item) => {
    const date = new Date(item._id);
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const key = `${date.getFullYear()}-Q${quarter}`;

    if (!groups[key]) {
      groups[key] = {
        totalHeartRate: 0,
        totalSleep: 0,
        totalSteps: 0,
        countBuckets: 0,
      };
    }

    groups[key].totalHeartRate += item.avgHeartRate || 0;
    groups[key].totalSleep += item.avgSleepDuration || 0;
    groups[key].totalSteps += item.totalSteps || 0;
    groups[key].countBuckets++;
  });

  return groups;
}

// Last 6 months summary for heart (from realtime buckets) and sleep (from daily buckets)
function summarizeLastSixMonths(realtimeBuckets: HealthBucket[], dailyBuckets: HealthBucket[]) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // heart: use realtime buckets
  const validRealtime = realtimeBuckets.filter((item) => new Date(item._id) >= sixMonthsAgo);
  let totalHeartRate = 0;
  validRealtime.forEach((item) => {
    totalHeartRate += item.avgHeartRate || 0;
  });
  const avgHeartRate = validRealtime.length
    ? Number((totalHeartRate / validRealtime.length).toFixed(1))
    : 0;

  // sleep: use daily buckets (aggDaily should have avgSleepDuration)
  const validDaily = dailyBuckets.filter((item) => new Date(item._id) >= sixMonthsAgo);
  let totalSleep = 0;
  validDaily.forEach((item) => {
    totalSleep += item.avgSleepDuration || 0;
  });
  const avgSleep = validDaily.length
    ? Number((totalSleep / validDaily.length / 60).toFixed(1))
    : 0;

  // total steps from realtime buckets
  let totalSteps = 0;
  validRealtime.forEach((item) => {
    totalSteps += item.totalSteps || 0;
  });

  return { avgHeartRate, avgSleep, totalSteps };
}

// ----------------- Main Component -----------------

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("daily");

  const [latestRealtime, setLatestRealtime] = useState<RealtimeReading | null>(null);
  const [latestDaily, setLatestDaily] = useState<DailyReading | null>(null);

  // aggregated weekly buckets (realtime + daily)
  const [aggRealtime, setAggRealtime] = useState<HealthBucket[]>([]);
  const [aggDaily, setAggDaily] = useState<HealthBucket[]>([]);

  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");

  // Fetch latest (realtime + daily)
  const fetchLatest = async () => {
    try {
      const [rRes, dRes] = await Promise.all([
        API.get("/realtime/latest"),
        API.get("/daily/latest"),
      ]);
      setLatestRealtime(rRes.data.data);
      setLatestDaily(dRes.data.data);
      setConnectionError("");
    } catch (error) {
      setConnectionError("Health data service is unavailable.");
    }
  };

  // Fetch weekly aggregated buckets (used as the canonical set of buckets)
  const fetchAggregates = async () => {
    try {
      const [rAgg, dAgg] = await Promise.all([
        API.get("/realtime/aggregate", { params: { period: "weekly" } }),
        API.get("/daily/aggregate", { params: { period: "weekly" } }),
      ]);
      setAggRealtime(rAgg.data.data || []);
      setAggDaily(dAgg.data.data || []);
    } catch (error) {
      setConnectionError("Health history could not be loaded.");
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchLatest(), fetchAggregates()]).finally(() => setLoading(false));
    const realtimeTimer = window.setInterval(fetchLatest, 5000);
    const aggregateTimer = window.setInterval(fetchAggregates, 60000);
    return () => {
      window.clearInterval(realtimeTimer);
      window.clearInterval(aggregateTimer);
    };
  }, []);

  // ----------------- Summary Calculation -----------------

  let displayHeartRate: number | string = "—";
  let displaySleep: number | string = "—";
  let displaySteps: number | string = "—";

  // DAILY — Use latest realtime for heart/steps, latest daily doc for sleep
  if (selectedPeriod === "daily") {
    displayHeartRate = latestRealtime?.heart_rate ?? "—";
    displaySleep = latestDaily?.sleep?.duration
      ? Number((latestDaily.sleep.duration / 60).toFixed(1))
      : "—";
    displaySteps = latestRealtime?.steps ?? "—";
  }

  // MONTHLY — group weekly buckets by month and use last month group
  if (selectedPeriod === "monthly") {
    const groupedR = groupByMonth(aggRealtime);
    const groupedD = groupByMonth(aggDaily);
    const monthKeys = Object.keys(groupedR);
    const lastMonthKey = monthKeys.length ? monthKeys.at(-1) : null;

    if (lastMonthKey) {
      const gR = groupedR[lastMonthKey];
      displayHeartRate = Number((gR.totalHeartRate / gR.countBuckets).toFixed(1));
      const gD = groupedD[lastMonthKey];
      displaySleep = gD ? Number((gD.totalSleep / gD.countBuckets / 60).toFixed(1)) : 0;
      displaySteps = gR.totalSteps;
    }
  }

  // QUARTERLY — group weekly buckets by quarter and use last quarter group
  if (selectedPeriod === "quarterly") {
    const groupedR = groupByQuarter(aggRealtime);
    const groupedD = groupByQuarter(aggDaily);
    const quarterKeys = Object.keys(groupedR);
    const lastKey = quarterKeys.length ? quarterKeys.at(-1) : null;

    if (lastKey) {
      const gR = groupedR[lastKey];
      displayHeartRate = Number((gR.totalHeartRate / gR.countBuckets).toFixed(1));
      const gD = groupedD[lastKey];
      displaySleep = gD ? Number((gD.totalSleep / gD.countBuckets / 60).toFixed(1)) : 0;
      displaySteps = gR.totalSteps;
    }
  }

  // SIX MONTHS — aggregate last 6 months (heart from aggRealtime, sleep from aggDaily)
  if (selectedPeriod === "sixmonthly") {
    const res = summarizeLastSixMonths(aggRealtime, aggDaily);
    displayHeartRate = res.avgHeartRate;
    displaySleep = res.avgSleep;
    displaySteps = res.totalSteps;
  }

  // ----------------- Realtime / Latest UI values -----------------

  const heartRateValue = latestRealtime?.heart_rate ?? "—";
  const bloodPressureValue = latestRealtime?.blood_pressure
    ? `${latestRealtime.blood_pressure.systolic}/${latestRealtime.blood_pressure.diastolic}`
    : "—";
  const stepsValue = latestRealtime?.steps ?? "—";

  const sleepMins = latestDaily?.sleep?.duration;
  const sleepDisplay = sleepMins == null
    ? "Unavailable"
    : `${Math.floor(sleepMins / 60)}h ${sleepMins % 60}m`;
  const realtimeTimestamp = latestRealtime?.timestamp
    ? new Date(latestRealtime.timestamp).getTime()
    : 0;
  const isFresh =
    !connectionError && realtimeTimestamp > 0 && Date.now() - realtimeTimestamp < 120000;
  const connectionLabel = connectionError ? "Disconnected" : isFresh ? "Connected" : "Stale";

  // ----------------- UI -----------------

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="md:ml-64 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* HEADER */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Health Dashboard</h1>
              <p className="text-muted-foreground">Real-time monitoring & insights</p>
            </div>

            <div className="flex items-center gap-3">
              <Badge
                className={
                  isFresh
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }
              >
                {isFresh ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                {connectionLabel}
              </Badge>

              <Button variant="outline" asChild>
                <a href={`tel:${import.meta.env.VITE_EMERGENCY_NUMBER || "112"}`}>
                  <Phone className="w-4 h-4 mr-2" /> Emergency
                </a>
              </Button>
            </div>
          </div>

          {/* PERIOD TABS */}
          <Tabs
            value={selectedPeriod}
            onValueChange={(val) => setSelectedPeriod(val.toLowerCase())}
          >
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
              <TabsTrigger value="sixmonthly">6 Monthly</TabsTrigger>
            </TabsList>

            <TabsContent value={selectedPeriod}>
              {/* REALTIME METRICS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* HEART RATE */}
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Heart Rate</p>
                      <p className="text-2xl font-bold">{heartRateValue}</p>
                      <p className="text-xs text-muted-foreground">bpm</p>
                    </div>
                    <Heart className="w-8 h-8 text-red-500" />
                  </div>
                </Card>

                {/* BLOOD PRESSURE */}
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Blood Pressure</p>
                      <p className="text-2xl font-bold">{bloodPressureValue}</p>
                      <p className="text-xs text-muted-foreground">mmHg</p>
                    </div>
                    <Activity className="w-8 h-8 text-green-500" />
                  </div>
                </Card>

                {/* SLEEP */}
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Sleep</p>
                      <p className="text-2xl font-bold">{sleepDisplay}</p>
                    </div>
                    <Moon className="w-8 h-8 text-purple-500" />
                  </div>
                </Card>

                {/* STEPS */}
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Steps</p>
                      <p className="text-2xl font-bold">{stepsValue}</p>
                    </div>
                    <Activity className="w-8 h-8 text-blue-500" />
                  </div>
                </Card>
              </div>

              {/* SUMMARY CARD */}
              <Card>
                <CardHeader>
                  <CardTitle>Summary ({selectedPeriod})</CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Heart Rate</p>
                      <p className="text-xl font-bold">{displayHeartRate}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Avg Sleep</p>
                      <p className="text-xl font-bold">{displaySleep}h</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Total Steps</p>
                      <p className="text-xl font-bold">
                        {typeof displaySteps === "number"
                          ? displaySteps.toLocaleString()
                          : displaySteps}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* QUICK LINKS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Link to="/heart-health">
                  <Card className="hover:shadow-lg p-6 cursor-pointer">
                    <CardTitle>Heart Health</CardTitle>
                    <p className="text-sm text-muted-foreground">Cardiovascular insights</p>
                  </Card>
                </Link>

                <Link to="/mental-health">
                  <Card className="hover:shadow-lg p-6 cursor-pointer">
                    <CardTitle>Mental Health</CardTitle>
                    <p className="text-sm text-muted-foreground">Stress insights</p>
                  </Card>
                </Link>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
