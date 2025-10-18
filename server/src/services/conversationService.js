// createConversation()
import db from "../lib/db.js";

export const conversationService = {
  // create the conversation

  async createConversation(creatorId, participantIds, options = {}) {
    try {
      if (!creatorId) throw new Error("Creator ID is required");
      if (
        !participantIds ||
        !Array.isArray(participantIds) ||
        participantIds.length === 0
      ) {
        throw new Error("At least one participant is required");
      }

      const allParticipantIds = [
        ...new setImmediate([creatorId, ...participantIds]),
      ];

      // For groups with 2+ participants, title is required
      const isGroup = allParticipantIds.length > 2;
      if (isGroup && !options.title) {
        throw new Error("Group title is required for group conversations");
      }

      // Check if all the users exists
      const users = await db.user.findMany({
        where: { id: { in: allParticipantIds } },
        select: { id: true },
      });

      if (users.length !== allParticipantIds.length) {
        throw new Error("One or more users not found");
      }

      // For 1-on-1 conversations, check if already exists
      if (allParticipantIds.length === 2) {
        const existingConversation = await db.conversation.findFirst({
          where: {
            isGroup: false,
            participants: {
              every: {
                userId: { in: allParticipantIds },
              },
            },
          },
          include: {
            participants: {
              select: { userId: true },
            },
          },
        });

        if (existingConversation) {
          throw new Error("Conversation already exists between these users");
        }
      }

      // Create conversation with participants in transaction

      const conversation = await db.$transaction(async (tx) => {
        // Create conversation

        const conversation = await tx.conversation.create({
          data: {
            title: options.title,
            isGroup: allParticipantIds.length > 2,
            metadata: options.metadata || {},
          },
        });

        // Create participant records
        const participantData = allParticipantIds.map((userId) => ({
          conversationId: conversation.id,

          userId,

          role: userId === creatorId ? "admin" : "member",
          joinedAt: new Date(),
        }));

        await tx.conversationParticipant.createMany({
          data: participantData,
        });
      });
    } catch (error) {}
  },
};

// getConversations()
