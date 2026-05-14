import { Check, AlertCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  apiConnected: boolean;
  cookieConfigured: boolean;
}

export function PinterestMethodStatus({ apiConnected, cookieConfigured }: Props) {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pinterest Posting Method
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {apiConnected ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Clock className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium">Official API</div>
              <div className="text-muted-foreground">
                {apiConnected
                  ? "Connected — used for all publishing"
                  : "Pending Standard Access — production path once approved"}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="font-medium">Cookie Fallback</div>
              <div className="text-muted-foreground">
                {cookieConfigured
                  ? "Available for internal testing only — not used while API is connected"
                  : "Available for internal testing only"}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
