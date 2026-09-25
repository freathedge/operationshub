"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmployeeOption {
  id: string;
  fullName: string;
}

export function AssetAssignControl({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/employees").then(async (response) => {
      if (cancelled || !response.ok) return;
      const body = await response.json();
      setEmployees(body.employees);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function assign() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", targetEmployeeId: selectedId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to assign asset");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="assign-to">Assign to</Label>
      <div className="flex gap-2">
        <Select value={selectedId} onValueChange={(value) => setSelectedId(value ?? undefined)}>
          <SelectTrigger id="assign-to" className="w-56">
            <SelectValue placeholder="Select an employee" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((employee) => (
              <SelectItem key={employee.id} value={employee.id}>
                {employee.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={assign}>
          Assign
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
