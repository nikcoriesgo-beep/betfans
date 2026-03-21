import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ResidualIncome() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/referrals");
  }, [setLocation]);

  return null;
}
