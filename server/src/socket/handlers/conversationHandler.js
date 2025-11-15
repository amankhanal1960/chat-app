import { conversationService } from "../../services/conversationService";

export const conversationHandler = {
  // handle creating a new conversation

  async createConversation(socket, data, callback) {
    try {
      console.log("Conversation Creation attempt:", {
        user: socket.data.user.id,
        participants: data.participantIds,
      });

      const { participantIds, title, metadata } = data;
      const creatorId = socket.data.user.id;

      if (!participantIds || !Array.isArray(participantIds)) {
        if (callback) {
          callback({
            success: false,
            error: "Participant IDs array is required",
          });
        }
        return;
      }

      // Create the conversation
      const conversation = await conversationService.createConversation(
        creatorId,
        participantIds,
        { title, metadata }
      );

      // Prepare response

      const conversationData = {
        id: conversation.id,
        title: conversation.title,
        isGroup: conversation.isGroup,
        metadata: conversation.metadata,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        participants: conversation.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          role: p.role,
        })),

        latestMessage: conversation.messages[0]
          ? {
              id: conversation.messages[0].id,
              content: conversation.messages[0].content,
              createdAt: conversation.messages[0].createdAt,
              sender: conversation.messages[0].sender,
            }
          : null,
      };

      // send acknowledgement to creator
      if (callback) {
        callback({
          success: true,
          conversation: conversationData,
        });
      }

      // Notify other participants about the new conversation

      conversation.participants.forEach((participant) => {
        if (participant.user.id !== creatorId) {
          socket
            .to(`user: ${participant.user.id}`)
            .emit("conversation:new", conversationData);
        }
      });

      console.log("Conversation created successfully:", conversationData);
    } catch (error) {
      console.error("createConversation error:", error);

      if (callback) {
        callback({
          success: false,
          error: error.message || "Failed to create conversation",
        });
      }
    }
  },

  // handles fetching users new conversations

  async getConversations(socket, data, callback) {
    try {
      const { limit, skip } = data;
      const userId = socket.data.user.id;

      const result = await conversationService.getConversations(userId, {
        limit: parseInt(limit) || 50,
        skip: parseInt(skip) || 0,
      });

      if (callback) {
        callback({
          success: true,
          ...result,
        });
      }
    } catch (error) {
      console.error("Get conversations error:", error);

      if (callback) {
        callback({
          success: false,
          error: error.message || "Failed to fetch conversations",
        });
      }
    }
  },

  // handle fetching a specific conversation details
  async getConversation(socket, data, callback) {
    try {
      const { conversationId } = data;
      const userId = socket.data.user.id;

      if (!conversationId) {
        if (callback) {
          callback({ success: false, error: "Conversation ID is required" });
        }

        return;
      }

      const conversation = await conversationService.getConversation(
        conversationId,
        userId
      );

      if (callback) {
        callback({
          success: true,
          conversation: {
            id: conversation.id,
            title: conversation.title,
            isGroup: conversation.isGroup,
            metadata: conversation.metadata,
            participants: conversation.participants.map((p) => ({
              id: p.user.id,
              name: p.user.name,
              email: p.user.email,
              role: p.role,
            })),

            participantCount: conversation._count.participants,
            messageCount: conversation._count.messages,
          },
        });
      }
    } catch (error) {
      console.error("Get Conversation error:", error);

      if (callback) {
        callback({
          success: false,
          error: error.message || "Failed to fetch conversation",
        });
      }
    }
  },
};
