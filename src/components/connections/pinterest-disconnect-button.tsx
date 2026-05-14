"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Unlink } from "lucide-react";

export function PinterestDisconnectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  async function confirmDisconnect() {
    setWorking(true);
    try {
      const res = await fetch("/api/connections/pinterest/oauth", {
        method: "DELETE",
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-destructive hover:text-destructive"
      >
        <Unlink className="mr-2 h-4 w-4" />
        Disconnect
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Pinterest?</DialogTitle>
            <DialogDescription>
              This clears the OAuth access and refresh tokens for this brand.
              The Pinterest API will no longer be reachable from this connection
              until you reconnect. Existing published pins and API logs stay in
              place.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={working}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDisconnect}
              disabled={working}
            >
              {working ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting…
                </>
              ) : (
                <>
                  <Unlink className="mr-2 h-4 w-4" />
                  Disconnect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
