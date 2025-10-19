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

      // Builds allParticipantIds by merging creatorid with participantIds and removing duplicates using set
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
      // Prevents duplicate 1-on-1 conversation
      if (allParticipantIds.length === 2) {
        const existingConversation = await db.conversation.findFirst({
          where: {
            isGroup: false,
            participants: {
              every: {
                // every participants userId is in allParticipantIds
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
        // Build the participantData array
        const participantData = allParticipantIds.map((userId) => ({
          conversationId: conversation.id,

          userId,

          role: userId === creatorId ? "admin" : "member",
          joinedAt: new Date(),
        }));

        await tx.conversationParticipant.createMany({
          data: participantData,
        });

        // Fetch the complete conversation with participants

        return await tx.conversation.findUnique({
          where: { id: conversation.id },
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
              include: {
                sender: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        });
      });

      return conversation;
    } catch (error) {
      console.error("ConversationService.createConversation error:", error);
      throw error;
    }
  },

  // Get all the conversations for a user with pagination

  async getConversations(userId, options = {}) {
    try {
      const { limit = 50, skip = 0 } = options;

      if (!userId) throw new Error("User ID is required");

      // Get the conversations with participant count and the latest message

      const conversations = await db.conversation.findMany({
        where: {
          participants: {
            some: { userId },
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: {
              sender: {
                select: { id: true, name: true, email: true },
              },
              attachments: {
                take: 1, // atmost 1 attachement per message
                select: {
                  id: true,
                  mimeType: true, // type of the attachment
                  url: true,
                },
              },
            },
          },
          _count: {
            select: {
              participants: true,
              messages: true,
            },
          },
        },

        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      });

      // Transform the data for client

      const transformedConversations = conversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        isGroup: conv.isGroup,
        metadata: conv.metadata,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        participants: conv.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          role: p.role,
          lastReadAt: p.lastReadAt,
        })),

        latestMessage: conv.messages[0]
          ? {
              id: conv.messages[0].id,
              content: conv.messages[0].content,
              createdAt: conv.messages[0].createdAt,
              sender: conv.messages[0].sender,
              attachments: conv.messages[0].attachments,
            }
          : null,
        unreadCount: 0,
        participantCount: conv._count.participants,
        messageCount: conv._count.messages,
      }));

      // Get total count for pagination
      const totalCount = await db.conversation.count({
        where: {
          participants: {
            some: { userId },
          },
        },
      });

      return {
        conversations: transformedConversations,
        pagination: {
          total: totalCount,
          hasMore: skip + limit < totalCount,
          nextSkip: skip + limit,
        },
      };
    } catch (error) {
      console.error("ConversationService.getConversations error:", error);
      throw error;
    }
  },

  // Get a single conversation
  async getConversation(conversationId, userId) {
    try {
    } catch (error) {}
  },
};
