import React, {
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import Icon from "./Icon";
import { KINDS, timecode } from "../shared/model.mjs";
const Player = forwardRef(function Player(
  { source, stamps, onStamp, onPosition, onError },
  ref,
) {
  const video = useRef(null);
  const lastPosition = useRef(0);
  const [playbackSource, setPlaybackSource] = useState(
    window.CinemaNative && source.startsWith("./media/") ? "" : source,
  );
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [playing, setPlaying] = useState(false),
    [ready, setReady] = useState(false),
    [theater, setTheater] = useState(false);
  const toggle = () => {
    const el = video.current;
    if (!el || !ready) return;
    if (el.paused)
      el.play().catch(() =>
        onError(
          "Playback could not start. Try another MP4 encoded with H.264 video and AAC audio.",
        ),
      );
    else el.pause();
  };
  const seek = (seconds) => {
    const el = video.current;
    if (!el || !ready) return;
    el.currentTime = Math.min(duration, Math.max(0, seconds));
    setTime(el.currentTime);
  };
  const stamp = (kind) => {
    if (ready) onStamp(kind, video.current.currentTime);
  };
  useImperativeHandle(ref, () => ({
    toggle,
    stamp,
    seek,
    skip: (delta) => seek((video.current?.currentTime || 0) + delta),
    exitTheater: () => {
      if (theater) {
        setTheater(false);
        return true;
      }
      return false;
    },
  }));
  useEffect(() => {
    setReady(false);
    setTime(0);
    setDuration(0);
    setPlaying(false);
    let active = true,
      objectUrl;
    if (window.CinemaNative && source.startsWith("./media/")) {
      setPlaybackSource("");
      fetch(source)
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.blob();
        })
        .then((blob) => {
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            setPlaybackSource(objectUrl);
          }
        })
        .catch(() => {
          if (active)
            onError(
              "The bundled film could not be loaded. Reinstall the app or open your own video.",
            );
        });
    } else setPlaybackSource(source);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);
  return (
    <section
      className={`player-area ${theater ? "theater" : ""}`}
      aria-label="Video screening"
    >
      <div className="video-frame">
        {source ? (
          <video
            ref={video}
            src={playbackSource || undefined}
            preload="metadata"
            playsInline
            poster={
              source.includes("sintel-trailer")
                ? "./media/sintel-poster.jpg"
                : undefined
            }
            onLoadedMetadata={(e) => {
              setDuration(e.target.duration);
              setReady(true);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              setTime(e.target.currentTime);
              if (Date.now() - lastPosition.current > 1500) {
                lastPosition.current = Date.now();
                onPosition(e.target.currentTime);
              }
            }}
            onError={() => {
              setReady(false);
              onError(
                "This video could not be loaded. Use a direct MP4 link or send an H.264/AAC MP4 from your phone.",
              );
            }}
          />
        ) : (
          <div className="missing-video">
            Reopen your local video to continue this saved review.
          </div>
        )}
        <div className="transport">
          <button
            className="icon-button"
            onClick={toggle}
            disabled={!ready}
            aria-label={playing ? "Pause video" : "Play video"}
          >
            <Icon name={playing ? "pause" : "play"} size={27} />
          </button>
          <div className="seek-wrap">
            <input
              aria-label="Playback position"
              type="range"
              min="0"
              max={duration || 1}
              step="0.1"
              value={time}
              disabled={!ready}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <div className="timeline-marks" aria-hidden="true">
              {duration > 0 &&
                stamps.map((s) => (
                  <i
                    key={s.id}
                    className={s.kind}
                    style={{
                      left: `${Math.min(100, (s.time / duration) * 100)}%`,
                    }}
                  />
                ))}
            </div>
          </div>
          <span className="timecode">
            {timecode(time)} <span>/ {timecode(duration)}</span>
          </span>
          <button
            className="icon-button"
            aria-label={theater ? "Exit theater view" : "Theater view"}
            onClick={() => setTheater(!theater)}
          >
            <Icon name="full" />
          </button>
        </div>
      </div>
      <div className="reaction-bar">
        {Object.entries(KINDS).map(([kind, info]) => (
          <button
            key={kind}
            className={`reaction ${kind}`}
            disabled={!ready}
            onClick={() => stamp(kind)}
          >
            <Icon name={info.icon} size={30} />
            <span>{info.label}</span>
            <kbd>{info.key}</kbd>
          </button>
        ))}
      </div>
    </section>
  );
});
export default Player;
