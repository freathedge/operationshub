"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AssetListItem {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  status: string;
  assignedTo: string | null;
}

const STATUS_OPTIONS = ["available", "assigned", "maintenance", "retired", "lost"];

export function AssetListView({
  companyId,
  canCreate,
}: {
  companyId: string;
  canCreate: boolean;
}) {
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
      <div className="flex items-center justify-between">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
        {canCreate && (
          <Button render={<Link href="/assets/new" />} nativeButton={false}>
            New asset
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading assets...</p>}
      {error && <p className="text-red-600">Failed to load assets.</p>}

      {data && (
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
      )}
    </div>
  );
}
