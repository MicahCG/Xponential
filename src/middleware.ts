export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/connections/:path*", "/personality/:path*", "/content/:path*", "/settings/:path*"],
};
