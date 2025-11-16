import { Server } from "socket.io";
import { socketAuthMiddleware } from "./auth-adapter.js";
import { conversationHandler } from "./handlers/conversationHandler.js";

import { messageHandler } from "./handlers/messageHandler.js";

export function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    console.log("User connected:", socket.data.user.id);

    // Register conversation handlers
    socket.on("getConversations", (data, callback) => {
      conversationHandler.getConversations(socket, data, callback);
    });

    socket.on("getConversation", (data, callback) => {
      conversationHandler.getConversation(socket, data, callback);
    });

    socket.on("createConversation", (data, callback) => {
      conversationHandler.createConversation(socket, data, callback);
    });

    // Message handlers
    socket.on("sendMessage", (data, callback) => {
      messageHandler.sendMessage(socket, data, callback);
    });

    socket.on("getMessages", (data, callback) => {
      messageHandler.getMessages(socket, data, callback);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected", socket.data.user.id);
    });
  });

  return io;
}
