























import React, { useEffect, useState } from "react";
import { Navigation } from "../components/ui/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Heart, Activity, Brain, Battery } from "lucide-react";
import { API } from "../api/api";

interface RealtimeReading {
  heart_rate: number;
  blood_pressure?: { systolic: number; diastolic: number };
  spo2: number;
  stress_level: number;
}

export default function HeartHealth() {
  const [data, setData] = useState<RealtimeReading | null>(null);
  const [error, setError] = useState("");

  const fetchRealtime = async () => {
    try {
      const res = await API.get("/realtime/latest");
      setData(res.data.data);
      setError("");
    } catch (err) {
      setError("Realtime cardiovascular data is unavailable.");
    }
  };

  useEffect(() => {
    fetchRealtime();
    const timer = window.setInterval(fetchRealtime, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const heartRate = data?.heart_rate ?? "—";
  const bloodPressure = data?.blood_pressure
    ? `${data.blood_pressure.systolic}/${data.blood_pressure.diastolic}`
    : "—";
  const spo2 = data?.spo2 ?? "—";
  const stress = data?.stress_level ?? "—";
  const isHighRisk =
    data && (data.heart_rate < 50 || data.heart_rate > 110 || data.spo2 < 93);
  const needsAttention =
    data && !isHighRisk && (data.heart_rate < 60 || data.heart_rate > 100 || data.spo2 < 95);
  const status = error || !data
    ? { label: "Data unavailable", message: "No current reading is available; do not rely on this page for status.", className: "border-destructive bg-destructive/10" }
    : isHighRisk
      ? { label: "Urgent reading", message: "One or more readings are outside the configured emergency range.", className: "border-destructive bg-destructive/10" }
      : needsAttention
        ? { label: "Needs attention", message: "One or more readings are outside the configured normal range.", className: "border-warning bg-warning/10" }
        : { label: "Within configured range", message: "The latest readings are within the configured monitoring range.", className: "border-success bg-success/10" };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="md:ml-64 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* HEADER */}
          <div>
            <h1 className="text-3xl font-bold">Heart Health</h1>
            <p className="text-muted-foreground">
              Real-time cardiovascular insights
            </p>
          </div>

          {/* METRICS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Heart Rate */}
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Heart Rate <Heart className="w-5 h-5 text-red-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{heartRate}</p>
                <p className="text-sm text-muted-foreground">beats per minute</p>
              </CardContent>
            </Card>

            {/* SpO2 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  SpO2 <Activity className="w-5 h-5 text-blue-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{spo2}%</p>
                <p className="text-sm text-muted-foreground">oxygen saturation</p>
              </CardContent>
            </Card>

            {/* Stress Level */}
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Stress Level <Brain className="w-5 h-5 text-purple-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{stress}</p>
                <p className="text-sm text-muted-foreground">current stress index</p>
              </CardContent>
            </Card>
          </div>

          {/* BLOOD PRESSURE */}
          <Card>
            <CardHeader>
              <CardTitle>Blood Pressure</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{bloodPressure}</p>
              <p className="text-sm text-muted-foreground">mmHg</p>
            </CardContent>
          </Card>

          {/* STATUS */}
          <Card className={status.className}>
            <CardContent className="py-4">
              <Badge>{status.label}</Badge>
              <p className="text-sm text-muted-foreground mt-2">
                {status.message}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
