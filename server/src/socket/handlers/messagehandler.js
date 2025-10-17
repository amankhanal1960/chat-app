import { messageService } from "../../services/messageService";

export const messageHandler = {
  // the function that handles sending the message
  async sendMessage(socket, data, callback) {
    try {
      console.log("Message send attempt:", {
        user: socket.data.user.id,
        conversation: data.conversationId,
        content: data.content?.substring(0, 50) + "...",
      });

      const { conversationId, content, attachments = [] } = data;
      const senderId = socket.data.user.id;

      if (!conversationId) {
        if (callback) {
          callback({ success: false, error: "Conversation ID is required" });
        }
        return;
      }

      if (!content?.trim() && attachments.length === 0) {
        if (callback) {
          callback({
            success: false,
            error: "Message content or attachments are required",
          });
        }
        return;
      }

      if (content && content.length > 2000) {
        if (callback) {
          callback({
            success: false,
            error: "Message content exceeds maximum length of 2000 characters",
          });
        }
        return;
      }

      // ======BUSINESS LOGIC ======
      const message = await messageService.createMessage({
        conversationId,
        senderId,
        content: content?.trim(),
        attachments,
      });

      const messageData = {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        sender: {
          id: message.sender.id,
          name: message.sender.name,
          email: message.sender.email,
        },
        attachments: message.attachments,
        conversationId: message.conversationId,
      };

      // ==========RESPONSE PHASE ==========
      if (callback) {
        callback({
          success: true,
          message: messageData,
        });
      }

      socket
        //socket.to(room) = send to this room, but exclude me
        .to(`conversation:${conversationId}`)
        .emit("message:new", messageData);

      console.log("Message Sent Successfully:", message.id);
    } catch (error) {
      console.error("Error sending the error:", error);

      if (callback) {
        callback({
          success: false,
          error: error.message || "Failed to send the message",
        });
      }
    }
  },

  // handle fetching the message history for a conversation
  async getMessages(socket, data, callback) {
    try {
      const { conversationId, limit = 50, cursor = null } = data;
      const userId = socket.data.user.id;

      if (!conversationId) {
        if (callback) {
          callback({ success: false, error: "Conversation ID is required" });
        }
        return;
      }

      if (callback) {
        callback({
          success: true,
          message: [],
          hasMore: false,
        });
      }
    } catch (error) {
      console.error("Get message error:", error);

      if (callback) {
        callback({
          success: false,
          error: error.message || "failed to fetch messages",
        });
      }
    }
  },

  async handleTyping(socket, data, callback) {
    try {
      const { conversationId, isTyping } = data;
      const user = socket.data.user;

      if (!conversationId) return;

      socket.to(`conversation:${conversationId}`).emit("user:typing", {
        userId: user.id,
        userName: user.name,
        isTyping,
        conversationId,
      });
    } catch (error) {
      console.error("Typing indicator error:", error);
    }
  },
};
