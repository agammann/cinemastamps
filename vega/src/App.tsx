import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import {useHideSplashScreenCallback} from '@amazon-devices/react-native-kepler';
import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import type {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';
import {NativePlayer} from './NativePlayer';
import {
  api,
  connectionFor,
  labels,
  timecode,
  type Connection,
  type Kind,
  type Review,
  type Stamp,
} from './api';

const STORE = 'cinemastamps.connection.v1';
const DEFAULT_BASE = 'http://10.0.2.2:8091';
const COLORS = {great: '#a9e68e', dragging: '#f1cc7b', confusing: '#c4aff5'};
type ButtonProps = {
  label: string;
  spokenLabel?: string;
  onPress: () => void;
  scale: number;
  color?: string;
  preferred?: boolean;
  disabled?: boolean;
  active?: boolean;
};
function Button({
  label,
  spokenLabel,
  onPress,
  scale,
  color,
  preferred,
  disabled,
  active,
}: ButtonProps) {
  const [focus, setFocus] = useState(false);
  return (
    <Pressable
      role="button"
      aria-label={spokenLabel || label}
      aria-disabled={!!disabled}
      aria-selected={active}
      disabled={disabled}
      hasTVPreferredFocus={preferred && !disabled}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onPress={onPress}
      style={{
        borderWidth: 2 * scale,
        borderColor: focus ? '#ffffff' : active ? '#a9e68e' : '#36383c',
        borderRadius: 9 * scale,
        paddingHorizontal: 13 * scale,
        paddingVertical: 8 * scale,
        backgroundColor: focus ? '#393d43' : '#202226',
        opacity: disabled ? 0.4 : 1,
      }}>
      <Text
        style={{
          color: color || '#f6f6f4',
          fontSize: 15 * scale,
          fontWeight: '600',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}
export const App = () => {
  const {width} = useWindowDimensions();
  const scale = width / 960;
  const s = useMemo(() => makeStyles(scale), [scale]);
  const hideSplash = useHideSplashScreenCallback();
  const player = useRef<VideoPlayer | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const savedConnection = useRef<Connection | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const latestReview = useRef<Review | null>(null);
  const [service, setService] = useState(DEFAULT_BASE);
  const [modal, setModal] = useState<'pair' | 'settings' | null>(null);
  const [pair, setPair] = useState<{url: string; qr: string} | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('Connecting to your screening room…');
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const [recovery, setRecovery] = useState({key: '', attempt: 0, resumeAt: 0});
  const playbackKey = `${connection?.token}:${review?.source.id}`;
  const recoveryAttempt = recovery.key === playbackKey ? recovery.attempt : 0;
  const pending = useRef(0);
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);
  const generation = useRef(0);
  const applyReview = useCallback((next: Review) => {
    if (!alive.current) return;
    if (
      !latestReview.current ||
      next.revision >= latestReview.current.revision
    ) {
      latestReview.current = next;
      setReview(next);
    }
  }, []);
  const connect = useCallback(async (base: string, token?: string) => {
    const serial = ++generation.current;
    try {
      const nextConnection = connectionFor(
        base,
        savedConnection.current,
        token,
      );
      const cleanBase = nextConnection.base;
      setService(cleanBase);
      // Keep the restored pairing available even if the first request fails.
      if (nextConnection.token) savedConnection.current = nextConnection;
      let nextReview: Review;
      if (nextConnection.token) {
        try {
          nextReview = await api(nextConnection, '/session');
        } catch (e) {
          if ((e as {status?: number}).status !== 401) throw e;
          nextConnection.token = '';
        }
      }
      if (!nextConnection.token) {
        const created = await api(nextConnection, '/sessions', 'POST', {
          title: 'First screening',
        });
        nextConnection.token = created.token;
        nextReview = created.review;
      }
      if (!alive.current || serial !== generation.current) return;
      await AsyncStorage.setItem(STORE, JSON.stringify(nextConnection));
      savedConnection.current = nextConnection;
      latestReview.current = nextReview!;
      setReview(nextReview!);
      setConnection(nextConnection);
      setService(cleanBase);
      setModal(null);
      setPair(null);
      setError('');
      setMessage('Your review is saved as you stamp.');
    } catch (e) {
      if (serial === generation.current && alive.current) {
        setError(String(e instanceof Error ? e.message : e));
        setModal('settings');
      }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    hideSplash();
    AsyncStorage.getItem(STORE)
      .then((value) => {
        let saved: Connection | null = null;
        try {
          saved = value ? JSON.parse(value) : null;
        } catch {
          /* A damaged setting starts a fresh connection. */
        }
        if (alive.current)
          connect(saved?.base || DEFAULT_BASE, saved?.token || '');
      })
      .catch(() => connect(DEFAULT_BASE));
    return () => {
      alive.current = false;
    };
  }, [connect, hideSplash]);
  useEffect(() => {
    if (!connection) return;
    let stopped = false,
      busy = false;
    const timer = setInterval(async () => {
      if (pending.current || busy) return;
      busy = true;
      try {
        const next = await api(connection, '/session');
        if (!stopped && !pending.current) {
          applyReview(next);
          setError('');
        }
      } catch (e) {
        if (!stopped) setError(String(e instanceof Error ? e.message : e));
      } finally {
        busy = false;
      }
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [connection, applyReview]);
  useEffect(() => {
    setReady(false);
    setTime(0);
    setDuration(0);
    setPlaying(false);
  }, [review?.source.id, connection?.token, recoveryAttempt]);
  const togglePlay = useCallback(() => {
    const video = player.current;
    if (!video || !ready) return;
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      video.play().catch((e) => setError(String(e)));
    } else video.pause();
  }, [ready]);
  const seek = useCallback(
    (delta: number) => {
      const video = player.current;
      if (video && ready)
        video.currentTime = Math.max(
          0,
          Math.min(video.duration || 0, video.currentTime + delta),
        );
    },
    [ready],
  );
  // W3C media's platform integration handles remote media keys. Handling them
  // here as well makes a single Play/Pause press toggle twice.
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modal) {
        setModal(null);
        return true;
      }
      if (reviewMode) {
        setReviewMode(false);
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [modal, reviewMode]);
  const stamp = (kind: Kind) => {
    if (!ready || !connection || !latestReview.current) return;
    const sourceId = latestReview.current.source.id;
    const captured = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
      kind,
      time: player.current?.currentTime || 0,
      note: '',
      sourceId,
    };
    const serial = generation.current;
    pending.current++;
    queue.current = queue.current.then(async () => {
      try {
        const next = await api(connection, '/stamps', 'POST', captured);
        if (serial === generation.current) {
          applyReview(next);
          setMessage(`${labels[kind]} saved at ${timecode(captured.time)}`);
          setError('');
        }
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        pending.current--;
      }
    });
  };
  const showPair = async () => {
    if (!connection) {
      setModal('settings');
      return;
    }
    player.current?.pause();
    setModal('pair');
    setPair(null);
    try {
      setPair(await api(connection, '/native/pair'));
    } catch (e) {
      setError(String(e));
    }
  };
  const jump = (item: Stamp) => {
    if (player.current && ready) {
      player.current.pause();
      player.current.currentTime = item.time;
      setMessage(`Reviewing ${timecode(item.time)} · ${labels[item.kind]}`);
    }
  };
  const visible = (review?.stamps || [])
    .filter((item) => !reviewMode || filter === 'all' || item.kind === filter)
    .slice()
    .sort((a, b) => a.time - b.time);
  const renderButton = (
    label: string,
    onPress: () => void,
    props: Partial<ButtonProps> = {},
  ) => <Button label={label} onPress={onPress} scale={scale} {...props} />;
  return (
    <View style={s.root}>
      <View style={s.header} aria-hidden={!!modal}>
        <Text style={s.brand}>Cinemastamps</Text>
        <View style={s.buttons}>
          {renderButton(
            reviewMode ? 'Screening room' : 'Review',
            () => setReviewMode(!reviewMode),
            {disabled: !!modal},
          )}
          {renderButton('Pair phone', showPair, {disabled: !!modal})}
          {renderButton(
            'Settings',
            () => {
              player.current?.pause();
              setModal('settings');
            },
            {disabled: !!modal},
          )}
        </View>
      </View>
      <View style={s.intro} aria-hidden={!!modal}>
        <Text style={s.title}>
          {review?.source.name || 'Your next screening starts here.'}
        </Text>
        <Text style={s.muted}>
          {status ||
            'Watch together. Leave feedback that stays with the moment.'}
        </Text>
      </View>
      <View style={s.body} aria-hidden={!!modal}>
        <View style={s.stage}>
          <View style={s.video}>
            {connection && review && (
              <NativePlayer
                key={`${playbackKey}:${recoveryAttempt}`}
                connection={connection}
                sourceId={review.source.id}
                player={player}
                resumeAt={recoveryAttempt ? recovery.resumeAt : undefined}
                onStall={(position) => {
                  if (!recoveryAttempt) {
                    setMessage('Recovering playback. Your stamps are saved.');
                    setRecovery({
                      key: playbackKey,
                      attempt: 1,
                      resumeAt: position,
                    });
                  } else {
                    setMessage(
                      'Playback stalled. Open Settings and choose Reload player.',
                    );
                  }
                }}
                onStatus={(value, isReady) => {
                  setStatus(value);
                  setReady(isReady);
                  if (isReady && recoveryAttempt)
                    setMessage('Player reloaded. Your stamps are saved.');
                }}
                onTick={(position, length, active) => {
                  setTime(position);
                  setDuration(length);
                  setPlaying(active);
                }}
              />
            )}
          </View>
          <View style={s.transport}>
            {renderButton(playing ? 'Pause' : 'Play', togglePlay, {
              preferred: true,
              disabled: !ready || !!modal,
            })}
            {renderButton('−10s', () => seek(-10), {
              spokenLabel: 'Rewind 10 seconds',
              disabled: !ready || !!modal,
            })}
            {renderButton('+10s', () => seek(10), {
              spokenLabel: 'Forward 10 seconds',
              disabled: !ready || !!modal,
            })}
            <Text style={s.time}>
              {timecode(time)} / {timecode(duration)}
            </Text>
          </View>
          <View style={s.progress}>
            <View
              style={[
                s.progressFill,
                {
                  width: `${
                    duration ? Math.min(100, (time / duration) * 100) : 0
                  }%`,
                },
              ]}
            />
          </View>
          <View style={s.reactions}>
            {(Object.keys(labels) as Kind[]).map((kind) => (
              <Button
                key={kind}
                label={labels[kind]}
                onPress={() => stamp(kind)}
                scale={scale}
                color={COLORS[kind]}
                disabled={!ready || !!modal}
              />
            ))}
          </View>
        </View>
        <View style={s.rail}>
          <View style={s.railHeading}>
            <Text style={s.railTitle}>
              {reviewMode ? 'Review your screening' : 'Your stamps'}
            </Text>
            <Text style={s.count}>{review?.stamps.length || 0}</Text>
          </View>
          {reviewMode && (
            <View style={s.filters}>
              {(['all', 'great', 'dragging', 'confusing'] as const).map(
                (kind) => (
                  <Button
                    key={kind}
                    label={
                      kind === 'all'
                        ? 'All'
                        : kind === 'great'
                        ? 'Great'
                        : kind === 'dragging'
                        ? 'Slow'
                        : '?'
                    }
                    scale={scale * 0.78}
                    spokenLabel={
                      kind === 'all' ? 'All reactions' : labels[kind]
                    }
                    active={filter === kind}
                    disabled={!!modal}
                    onPress={() => setFilter(kind)}
                  />
                ),
              )}
            </View>
          )}
          <ScrollView style={s.list} contentContainerStyle={s.listContent}>
            {!visible.length && (
              <View style={s.empty}>
                <Text style={s.emptyTitle}>Mark the moments that matter.</Text>
                <Text style={s.muted}>
                  Your feedback appears here as you watch.
                </Text>
              </View>
            )}
            {visible.map((item) => (
              <StampCard
                key={item.id}
                item={item}
                scale={scale}
                disabled={!!modal || !ready}
                onPress={() => jump(item)}
              />
            ))}
          </ScrollView>
          {renderButton('Export review', showPair, {disabled: !!modal})}
        </View>
      </View>
      <View style={s.footer} aria-hidden={!!modal}>
        <Text
          aria-live="polite"
          style={[s.small, error ? s.error : undefined]}
          numberOfLines={1}>
          {error || message}
        </Text>
        <Text style={s.credit}>
          {review?.source.kind === 'demo'
            ? 'Sintel trailer · Blender Foundation · CC BY 3.0'
            : 'Uploaded film · Private screening'}
        </Text>
      </View>
      {modal && (
        <View style={s.overlay}>
          <View style={s.dialog}>
            {modal === 'settings' ? (
              <>
                <Text style={s.title}>Connect your screening room</Text>
                <Text style={s.muted}>
                  Run the Docker companion on your computer. Enter its address
                  below.
                </Text>
                <TextInput
                  aria-label="Companion service address"
                  style={s.input}
                  value={service}
                  onChangeText={setService}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={s.muted}>
                  Vega preview: MP4 / WebM clips up to five minutes. Your
                  computer prepares playback and saves the review.
                </Text>
                {!!error && <Text style={s.error}>{error}</Text>}
                <View style={s.buttons}>
                  {renderButton('Connect', () => connect(service), {
                    preferred: true,
                  })}
                  {connection && renderButton('Cancel', () => setModal(null))}
                  {connection &&
                    renderButton('Reload player', () => {
                      setError('');
                      setModal(null);
                      setRecovery({
                        key: playbackKey,
                        attempt: recoveryAttempt + 1,
                        resumeAt: time,
                      });
                    })}
                </View>
              </>
            ) : (
              <>
                <Text style={s.title}>
                  Keep watching. Add the details on your phone.
                </Text>
                <View style={s.pairRow}>
                  {pair ? (
                    <Image
                      aria-label="Private companion QR code"
                      source={{uri: pair.qr}}
                      style={s.qr}
                    />
                  ) : (
                    <Text style={s.muted}>Creating your private link…</Text>
                  )}
                  <View style={s.pairText}>
                    <Text style={s.railTitle}>
                      One screening. All your feedback.
                    </Text>
                    <Text style={s.muted}>
                      Scan to add notes, send a film, or download CSV, Markdown
                      and JSON.
                    </Text>
                    <Text style={s.muted}>
                      Use the same Wi-Fi as the companion computer. This private
                      link expires after 24 hours.
                    </Text>
                    {pair && (
                      <Text style={s.small}>{pair.url.split('/?')[0]}</Text>
                    )}
                  </View>
                </View>
                <Text style={s.small}>
                  Sending a film starts a new review. Export your current stamps
                  first.
                </Text>
                {renderButton('Back to screening', () => setModal(null), {
                  preferred: true,
                })}
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};
function StampCard({
  item,
  scale,
  disabled,
  onPress,
}: {
  item: Stamp;
  scale: number;
  disabled: boolean;
  onPress: () => void;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <Pressable
      role="button"
      aria-label={`Jump to ${timecode(item.time)}, ${labels[item.kind]}${
        item.note ? `. ${item.note}` : ''
      }`}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        padding: 12 * scale,
        marginBottom: 8 * scale,
        borderWidth: 2 * scale,
        borderRadius: 9 * scale,
        borderColor: focus ? '#ffffff' : '#35373b',
        backgroundColor: focus ? '#353a40' : '#24262a',
      }}>
      <Text
        style={{
          color: COLORS[item.kind],
          fontWeight: '600',
          fontSize: 16 * scale,
        }}>
        {timecode(item.time)} {labels[item.kind]}
      </Text>
      <Text
        numberOfLines={3}
        style={{color: '#bcbec1', fontSize: 14 * scale, marginTop: 7 * scale}}>
        {item.note || 'Select to revisit · Add notes on your phone'}
      </Text>
    </Pressable>
  );
}
function makeStyles(k: number) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: '#17181b', padding: 20 * k},
    header: {
      height: 38 * k,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brand: {fontSize: 24 * k, fontWeight: '700', color: '#f4f4f0'},
    buttons: {flexDirection: 'row', gap: 8 * k, alignItems: 'center'},
    intro: {paddingTop: 12 * k, paddingBottom: 10 * k},
    title: {
      fontSize: 23 * k,
      fontWeight: '600',
      color: '#f4f4f0',
      marginBottom: 6 * k,
    },
    muted: {color: '#afb0b6', fontSize: 15 * k, lineHeight: 21 * k},
    body: {flex: 1, flexDirection: 'row', gap: 18 * k},
    stage: {flex: 1.25},
    video: {
      flex: 1,
      backgroundColor: '#000000',
      borderRadius: 12 * k,
      overflow: 'hidden',
    },
    transport: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8 * k,
      marginTop: 8 * k,
    },
    time: {marginLeft: 'auto', fontSize: 14 * k, color: '#b9bbc1'},
    progress: {height: 3 * k, backgroundColor: '#35383b', marginTop: 8 * k},
    progressFill: {height: 3 * k, backgroundColor: '#a9e68e'},
    reactions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10 * k,
      gap: 4 * k,
    },
    rail: {
      flex: 1,
      backgroundColor: '#1b1c20',
      padding: 14 * k,
      borderWidth: 1,
      borderColor: '#303136',
      borderRadius: 12 * k,
    },
    railHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12 * k,
    },
    railTitle: {fontSize: 18 * k, fontWeight: '600', color: '#efefed'},
    count: {fontSize: 15 * k, color: '#c4c5c8'},
    list: {flex: 1},
    listContent: {paddingBottom: 10 * k},
    empty: {paddingVertical: 35 * k, paddingHorizontal: 8 * k},
    emptyTitle: {
      fontSize: 21 * k,
      color: '#dedee1',
      lineHeight: 28 * k,
      marginBottom: 12 * k,
    },
    filters: {flexDirection: 'row', gap: 3 * k, marginBottom: 10 * k},
    footer: {
      paddingTop: 13 * k,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12 * k,
    },
    small: {fontSize: 12 * k, color: '#b8bac1', flexShrink: 1},
    credit: {fontSize: 10 * k, color: '#86898f'},
    error: {color: '#ffb9a6', fontSize: 14 * k},
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#101114f5',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dialog: {
      width: 750 * k,
      padding: 30 * k,
      borderRadius: 16 * k,
      backgroundColor: '#24262b',
      gap: 16 * k,
      borderWidth: 1,
      borderColor: '#45484f',
    },
    input: {
      color: '#ffffff',
      fontSize: 18 * k,
      padding: 14 * k,
      borderWidth: 2,
      borderColor: '#a9e68e',
      borderRadius: 8 * k,
      backgroundColor: '#151619',
    },
    pairRow: {flexDirection: 'row', gap: 25 * k, alignItems: 'center'},
    qr: {width: 200 * k, height: 200 * k},
    pairText: {flex: 1, gap: 14 * k},
  });
}
