"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

interface AssetListItem {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  status: string;
  assignedTo: string | null;
}

const STATUS_OPTIONS = ["available", "assigned", "maintenance", "retired", "lost"];

export function AssetListView({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["assets", { status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const response = await fetch(`/api/assets?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load assets");
      const body = await response.json();
      return body.assets as AssetListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:assets`, () => {
    queryClient.invalidateQueries({ queryKey: ["assets"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" || value === null ? "" : value)}>
        <SelectTrigger className="w-40">
          <SelectValue>{(value: string) => (value === "all" ? "All statuses" : value.charAt(0).toUpperCase() + value.slice(1))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && <p className="text-muted-foreground">Loading assets...</p>}
      {error && <p className="text-red-600">Failed to load assets.</p>}

      {data && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>
                      <Link href={`/assets/${asset.id}`} className="hover:underline">
                        {asset.assetCode}
                      </Link>
                    </TableCell>
                    <TableCell>{asset.name}</TableCell>
                    <TableCell>{asset.category}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{asset.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No assets found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
