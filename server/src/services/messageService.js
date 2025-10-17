import db from "../lib/db";

export const messageService = {
  async createMessage({ conversationId, senderId, content, attachments = [] }) {
    if (!conversationId) throw new Error("Conversation ID is required");
    if (!senderId) throw new Error("Sender ID is required");
    if (!content && attachments.length === 0)
      throw new Error("Message content or attachments are required");

    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId, // looking for the specific conversation
        participants: {
          some: { userId: senderId }, // Is sender in participants list??
        },
        select: { id: true },
      },
    });

    if (!conversation)
      throw new Error("Conversation not found or access denied");

    // Transaction to ensure the message creation are atomic and its either all succeed or none

    const result = await db.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          content,
          conversationId,
          senderId,

          attachments: attachments.length
            ? {
                create: attachments.map((a) => ({
                  url: a.fileUrl,
                  filename: a.filename,
                  mimeType: a.fileType,
                  sizeBytes: a.fileSize,
                })),
              }
            : undefined,
        },

        include: {
          sender: {
            select: { id: true, name: true, email: true },
          },
          attachments: true,
        },
      });

      //  // This is what gets stored in `const message`
      // {
      //   id: "msg_789",
      //   content: "Hello everyone!",
      //   conversationId: "conv_123",
      //   senderId: "user_456",
      //   createdAt: "2023-10-01T10:30:00.000Z",
      //   updatedAt: "2023-10-01T10:30:00.000Z",
      //   // From include:
      //   sender: {
      //     id: "user_456",
      //     name: "Alice",
      //     email: "alice@example.com"
      //   },
      //   attachments: [
      //     {
      //       id: "att_001",
      //       url: "https://example.com/file.jpg",
      //       filename: "photo.jpg",
      //       mimeType: "image/jpeg",
      //       sizeBytes: 1024000,
      //       messageId: "msg_789",
      //       createdAt: "2023-10-01T10:30:00.000Z"
      //     }
      //   ]
      // }

      //   and this is what gets returned when we return the message

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      const participants = await tx.conversationParticipant.findMany({
        where: { conversationId }, // All the participants in the conversation
        select: { userId: true }, // only their userIds
      });

      if (participants.length > 0) {
        // receipts for each participant in the conversation
        // to communicate delivery and read status of the message
        // sender gets both deliveredAt and readAt set to now
        // other participants get null for both initially
        const receipts = participants.map((p) => ({
          messageId: message.id,
          userId: p.userId,
          deliveredAt: p.userId === senderId ? new Date() : null,
          readAt: p.userId === senderId ? new Date() : null,
        }));

        await tx.messageReceipt.createMany({
          data: receipts,
          skipDuplicates: true,
        });
      }

      return message;
    });

    return result;
  },

  async getMessage(conversationId, userId, { limit = 50, cursor = null } = {}) {
    // Security: Check user is in conversation
    const canAccess = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
      },
    });

    if (!canAccess) throw new Error("Access Denied!");

    // Fetch the messages with pagination
    const messages = await db.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        attachments: true,
      },

      orderBy: { createdAt: "desc" },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop(); // Remove the extra

    return {
      messages: messages.reverse(),
      hasMore,
      nextCursor: hasMore ? messages[messages.length - 1]?.id : null,
    };
  },
};
