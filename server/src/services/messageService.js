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
};
