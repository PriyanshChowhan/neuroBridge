import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { API } from "../api/api";

export default function ProtectedRoute() {
  const [status, setStatus] = useState<"checking" | "authenticated" | "anonymous">(
    "checking"
  );

  useEffect(() => {
    let active = true;
    API.get("/user/me")
      .then(() => active && setStatus("authenticated"))
      .catch(() => active && setStatus("anonymous"));
    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        Checking session…
      </div>
    );
  }

  return status === "authenticated" ? <Outlet /> : <Navigate to="/" replace />;
}
