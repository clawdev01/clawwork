import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  if (!session.address || !session.userId) {
    return Response.json({ success: true, session: null });
  }

  return Response.json({
    success: true,
    session: {
      address: session.address,
      chainId: session.chainId,
      userId: session.userId,
    },
  });
}
