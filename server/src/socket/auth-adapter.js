import { verifyAccessToken } from "../utils/tokens";
import db from "../lib/db";

export async function socketAuthMiddleware(socket, next) {
  try {
    const token =
      (socket.handshake &&
        socket.handshake.auth &&
        socket.handshake.auth.token) ||
      (socket.handshake &&
      socket.handshake.headers &&
      socket.handshake.headers.authorization
        ? socket.handshake.headers.authorzation.split(" ")[1]
        : null);

    if (!token) return next(new Error("Authentication error"));

    const payload = verifyAccessToken(token);

    const userId = payload?.sub;
    if (!userId) return next(new Error("Authentication error"));

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, isEmailVerified: true },
    });

    if (!user) return next(new Error("User not found"));

    //Attach normalized user to the socket for handlers to use
    socket.data.user = {
      id: user.id,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
    };

    return next;
  } catch (error) {
    console.error("Socket auth error", error);
    return next(new Error("Authentication error"));
  }
}
