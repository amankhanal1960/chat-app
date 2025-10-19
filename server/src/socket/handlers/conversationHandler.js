import { conversationService } from "../../services/conversationService";

export const conversationHandler = {
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
};
// getConversations()
