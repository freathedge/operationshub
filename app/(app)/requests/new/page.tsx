import { BackLink } from "@/components/back-link";
import { RequestForm } from "@/components/requests/request-form";

export default function NewRequestPage() {
  return (
    <div>
      <BackLink href="/requests" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">New request</h1>
      <RequestForm />
    </div>
  );
}
