import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RequestForm } from "@/components/requests/request-form";

export default function NewRequestPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/requests" />
      <PageHeader title="New request" />
      <Card>
        <CardContent>
          <RequestForm />
        </CardContent>
      </Card>
    </div>
  );
}
