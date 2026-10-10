import { proto } from '../../WAProto';

/** Prepare one interactive/media card for MD delivery without sending or splitting it. */
export declare function prepareInteractiveMessageForMd<T extends proto.IMessage>(message: T): proto.IMessage;
