"use strict";

const WRAPPERS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];

/**
 * Prepare one interactive card for multi-device delivery. Media stays in its
 * header; this helper never sends, uploads, splits messages or switches buttons.
 * A matching WhatsApp client still decides which button types it can display.
 */
function prepareInteractiveMessageForMd(message) {
    if (!message || typeof message !== 'object') return message;
    if (message.ephemeralMessage?.message) {
        const inner = prepareInteractiveMessageForMd(message.ephemeralMessage.message);
        return inner === message.ephemeralMessage.message ? message : {
            ...message, ephemeralMessage: { ...message.ephemeralMessage, message: inner }
        };
    }
    const existing = WRAPPERS.find(name => message[name]?.message);
    const inner = existing ? message[existing].message : message;
    if (!inner.interactiveMessage) return message;
    const context = inner.messageContextInfo;
    if (existing && context?.deviceListMetadataVersion === 2 && context.deviceListMetadata != null) return message;
    const content = {
        ...inner,
        interactiveMessage: { ...inner.interactiveMessage },
        messageContextInfo: {
            ...(context || {}),
            deviceListMetadataVersion: 2,
            deviceListMetadata: context?.deviceListMetadata || {}
        }
    };
    return existing ? {
        ...message, [existing]: { ...message[existing], message: content }
    } : { viewOnceMessageV2Extension: { message: content } };
}

module.exports = { prepareInteractiveMessageForMd };
