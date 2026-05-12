"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import type { CallKind } from "./actions";
import { endCall } from "./actions";

type Props = {
  channelId: string;
  channelLabel: string;
  callId: string;
  kind: CallKind;
  token: string;
  serverUrl: string;
};

// Renders the LiveKit room and a top bar with channel context + leave button.
// Video calls start with camera+mic on; audio calls suppress the camera.
export function CallRoom({ channelId, channelLabel, callId, kind, token, serverUrl }: Props) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const leave = useCallback(
    async (alsoEnd: boolean) => {
      if (leaving) return;
      setLeaving(true);
      if (alsoEnd) {
        // Best-effort; ignore errors so we never strand the user in the room.
        await endCall(callId).catch(() => undefined);
      }
      router.push(`/channels/${channelId}`);
    },
    [callId, channelId, leaving, router],
  );

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-white">
      <header className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">
            {channelLabel} で {kind === "video" ? "ビデオ" : "音声"}通話
          </h1>
          <p className="text-xs text-gray-400">他のメンバーにも参加リンクが表示されます。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => leave(false)}
            className="rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium hover:bg-gray-600"
          >
            退出
          </button>
          <button
            type="button"
            onClick={() => leave(true)}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-500"
          >
            通話を終了
          </button>
        </div>
      </header>

      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        video={kind === "video"}
        audio
        data-lk-theme="default"
        className="flex-1"
        onDisconnected={() => leave(false)}
      >
        <Stage />
        <RoomAudioRenderer />
        <ControlBar variation="verbose" />
      </LiveKitRoom>
    </div>
  );
}

// useTracks must run inside the LiveKitRoom React context, so the stage is
// its own component. Camera+ScreenShare sources cover the typical mix; the
// audio-only call still renders avatar tiles via ParticipantTile fallback.
function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} style={{ height: "calc(100% - 80px)" }}>
      <ParticipantTile />
    </GridLayout>
  );
}
