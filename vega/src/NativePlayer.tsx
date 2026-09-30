import React, {useCallback, useEffect, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  VideoPlayer,
  MediaSource,
  KeplerVideoSurfaceView,
} from '@amazon-devices/react-native-w3cmedia';
import type {Connection} from './api';

// Vega releases shared media resources asynchronously. Finish teardown before
// initializing the player for a film received from the companion.
let mediaTeardown: Promise<void> = Promise.resolve();

type Props = {
  connection: Connection;
  sourceId: string;
  player: React.MutableRefObject<VideoPlayer | null>;
  onStatus: (status: string, ready: boolean) => void;
  onTick: (time: number, duration: number, playing: boolean) => void;
};
export function NativePlayer({
  connection,
  sourceId,
  player,
  onStatus,
  onTick,
}: Props) {
  const mounted = useRef(true);
  const controller = useRef(new AbortController());
  const callbacks = useRef({onStatus, onTick});
  callbacks.current = {onStatus, onTick};
  const localPlayer = useRef<VideoPlayer | null>(null);
  const surfaceHandle = useRef('');
  useEffect(() => {
    mounted.current = true;
    const abort = controller.current;
    const timer = setInterval(() => {
      const current = localPlayer.current;
      if (current)
        callbacks.current.onTick(
          current.currentTime || 0,
          Number.isFinite(current.duration) ? current.duration : 0,
          !current.paused && !current.ended,
        );
    }, 250);
    return () => {
      mounted.current = false;
      abort.abort();
      clearInterval(timer);
      const current = localPlayer.current;
      if (player.current === current) player.current = null;
      current?.pause();
      if (surfaceHandle.current)
        current?.clearSurfaceHandle(surfaceHandle.current);
      if (current)
        mediaTeardown = mediaTeardown
          .then(() => current.deinitialize())
          .catch(() => {});
    };
  }, [player]);
  const surface = useCallback(
    async (handle: string) => {
      surfaceHandle.current = handle;
      if (localPlayer.current) {
        localPlayer.current.setSurfaceHandle(handle);
        return;
      }
      const video = new VideoPlayer();
      localPlayer.current = video;
      player.current = video;
      const status = (message: string, ready = false) => {
        if (mounted.current) callbacks.current.onStatus(message, ready);
      };
      try {
        status('Preparing your screening…');
        await mediaTeardown;
        if (!mounted.current) return;
        await video.initialize();
        if (!mounted.current) {
          await video.deinitialize();
          return;
        }
        video.setSurfaceHandle(handle);
        video.addEventListener('error', () =>
          status(
            `Playback unavailable (${
              video.error?.code || 'media'
            }). Try another video from the companion.`,
          ),
        );
        const media = new MediaSource();
        media.addEventListener('sourceopen', async () => {
          try {
            const response = await fetch(
              `${connection.base}/api/native/media?source=${encodeURIComponent(
                sourceId,
              )}`,
              {
                headers: {Authorization: `Bearer ${connection.token}`},
                signal: controller.current.signal,
              },
            );
            if (!response.ok)
              throw new Error(
                (await response.json()).error || 'Could not prepare video.',
              );
            const bytes = await response.arrayBuffer();
            if (!mounted.current) return;
            if (bytes.byteLength > 32 * 1024 * 1024)
              throw new Error(
                'This prepared clip exceeds the playback memory limit.',
              );
            const buffer = media.addSourceBuffer(
              'video/mp4; codecs="avc1.42c01f,mp4a.40.2"',
            );
            buffer.addEventListener('updateend', () => {
              if (!mounted.current) return;
              if (media.readyState === 'open') media.endOfStream();
              status('Ready to review', true);
            });
            buffer.appendBuffer(bytes);
          } catch (error) {
            status(error instanceof Error ? error.message : String(error));
          }
        });
        video.srcObject = media;
      } catch (error) {
        status(String(error));
      }
    },
    [connection.base, connection.token, sourceId, player],
  );
  return (
    <View style={styles.frame}>
      <KeplerVideoSurfaceView
        style={StyleSheet.absoluteFill}
        onSurfaceViewCreated={surface}
        onSurfaceViewDestroyed={(handle: string) => {
          localPlayer.current?.clearSurfaceHandle(handle);
          surfaceHandle.current = '';
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {flex: 1, backgroundColor: '#000000'},
});
