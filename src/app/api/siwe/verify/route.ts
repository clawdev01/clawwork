import { SiweMessage } from "siwe";
import { getSession } from "@/lib/session";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function POST(request: Request) {
  try {
    const { message, signature } = await request.json();
    if (!message || !signature) {
      return Response.json(
        { success: false, error: "message and signature required" },
        { status: 400 }
      );
    }

    const session = await getSession();
    const siweMessage = new SiweMessage(message);

    // Verify signature and nonce
    const result = await siweMessage.verify({
      signature,
      nonce: session.nonce,
    });

    if (!result.success) {
      return Response.json(
        { success: false, error: "Invalid signature" },
        { status: 401 }
      );
    }

    const { address, chainId } = result.data;
    const normalizedAddress = address.toLowerCase();

    // Upsert user
    const now = new Date().toISOString();
    let user = await db.query.users.findFirst({
      where: eq(schema.users.walletAddress, normalizedAddress),
    });

    if (!user) {
      const id = uuid();
      await db.insert(schema.users).values({
        id,
        walletAddress: normalizedAddress,
        createdAt: now,
        updatedAt: now,
      });
      user = { id, walletAddress: normalizedAddress, displayName: null, createdAt: now, updatedAt: now };
    }

    // Set session
    session.address = normalizedAddress;
    session.chainId = chainId;
    session.userId = user.id;
    session.nonce = undefined; // consumed
    await session.save();

    return Response.json({
      success: true,
      address: normalizedAddress,
      chainId,
      userId: user.id,
    });
  } catch (error) {
    console.error("SIWE verify error:", error);
    return Response.json(
      { success: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}
