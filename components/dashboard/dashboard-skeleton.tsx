import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatCardSkeleton() {
  return (
    <Card className="@container/card">
      <CardHeader>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-8 w-16" />
      </CardHeader>
    </Card>
  );
}

function ListCardSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <div className="flex flex-col gap-3 px-6 pb-6">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
    </Card>
  );
}

export function PersonalSectionSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2">
        <ListCardSkeleton rows={3} />
        <ListCardSkeleton rows={3} />
      </div>
      <ListCardSkeleton rows={3} />
    </div>
  );
}

export function CompanySectionSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <ListCardSkeleton rows={3} />
      <ListCardSkeleton rows={3} />
      <ListCardSkeleton rows={3} />
    </div>
  );
}
