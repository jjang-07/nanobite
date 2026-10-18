export interface SendInput {
    from: string;
    to: string;
    subject: string;
    bodyText: string;
    /** Optional styled alternative; bodyText stays the canonical, parseable part. */
    bodyHtml?: string;
    idempotencyKey: string;
    inReplyTo?: string;
    references?: string[];
    wait?: boolean;
}
export interface SendResult {
    sentEmailId: string;
    status: string;
    deliveryStatus?: string;
}
export interface ReplyEmail {
    id: string;
    threadId: string | null;
    replyToSentEmailId: string | null;
    fromEmail: string;
    toEmail: string;
    subject: string | null;
    bodyText: string | null;
    receivedAt: string | null;
    fyi: boolean;
    senderVerified: boolean;
}
export interface InboundSummary {
    id: string;
    threadId: string | null;
    sender: string;
    recipient: string;
    subject: string | null;
    receivedAt: string;
    snippet: string | null;
    fyi: boolean;
    automated: boolean;
}
export interface InboundDetail extends InboundSummary {
    bodyText: string | null;
    /** True when the sender passed DMARC alignment at ingest. Unset for local mail. */
    dmarcPass?: boolean;
    bodyHtml: string | null;
    fromEmail: string;
    toEmail: string;
    replyToSentEmailId: string | null;
    inReplyTo: string[];
    references: string[];
    attachments: {
        filename: string | null;
        contentType: string | null;
        sizeBytes: number;
        partIndex: number;
    }[];
}
