













import React, { useEffect, useState } from "react";
import { Navigation } from "../components/ui/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Brain, Moon, Battery, Flower } from "lucide-react";
import { API } from "../api/api";

interface RealtimeReading {
  stress_level: number;
}

interface DailyReading {
  sleep?: { quality: string };
  energy_score: number;
}

export default function MentalHealth() {
  const [realtime, setRealtime] = useState<RealtimeReading | null>(null);
  const [daily, setDaily] = useState<DailyReading | null>(null);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const [rRes, dRes] = await Promise.all([
        API.get("/realtime/latest"),
        API.get("/daily/latest"),
      ]);

      setRealtime(rRes.data.data);
      setDaily(dRes.data.data);
      setError("");
    } catch (err) {
      setError("Mental-health inputs are unavailable.");
    }
  };

  useEffect(() => {
    fetchData();
    const timer = window.setInterval(fetchData, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const stress = realtime?.stress_level ?? "—";
  const sleepQuality = daily?.sleep?.quality ?? "—";
  const energyScore = daily?.energy_score ?? "—";
  const status = error || !realtime
    ? { label: "Mental status unavailable", message: "Current monitoring data is unavailable.", className: "border-destructive bg-destructive/10" }
    : realtime.stress_level > 60
      ? { label: "High stress detected", message: "The latest stress reading is above the configured escalation threshold.", className: "border-warning bg-warning/10" }
      : { label: "Within configured range", message: "The latest monitored stress reading is within the configured range.", className: "border-blue-400 bg-blue-50" };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="md:ml-64 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold">Mental Health</h1>
            <p className="text-muted-foreground">
              Track stress, sleep quality, and overall wellness
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Stress Level */}
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Stress Level <Brain className="w-5 h-5 text-purple-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{stress}</p>
                <p className="text-sm text-muted-foreground">current stress score</p>
              </CardContent>
            </Card>

            {/* Sleep Quality */}
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Sleep Quality <Moon className="w-5 h-5 text-blue-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{sleepQuality}</p>
                <p className="text-sm text-muted-foreground">
                  last night's sleep rating
                </p>
              </CardContent>
            </Card>

            {/* Energy Score */}
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Energy Score <Battery className="w-5 h-5 text-green-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{energyScore}</p>
                <p className="text-sm text-muted-foreground">current energy level</p>
              </CardContent>
            </Card>
          </div>

          {/* Mood */}
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                Mood Indicator <Flower className="w-5 h-5 text-pink-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-2xl font-semibold">Not assessed</p>
                <p className="text-sm text-muted-foreground mt-2">
                  A mood assessment is not available from the current sensor data.
              </p>
            </CardContent>
          </Card>

          {/* Status */}
          <Card className={status.className}>
            <CardContent className="py-4">
              <Badge>{status.label}</Badge>
              <p className="text-sm text-muted-foreground mt-3">
                {status.message}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
