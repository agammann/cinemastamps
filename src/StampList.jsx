import React, { useState } from "react";
import Icon from "./Icon";
import { KINDS, ordered, timecode } from "../shared/model.mjs";
export default function StampList({
  stamps,
  onSeek,
  onEdit,
  onRemove,
  expanded = false,
  readOnly = false,
}) {
  const [filter, setFilter] = useState("all");
  const shown = ordered(stamps).filter(
    (s) => !expanded || filter === "all" || s.kind === filter,
  );
  return (
    <section
      className={`stamp-panel ${expanded ? "expanded" : ""}`}
      aria-label="Your stamps"
    >
      <header className="panel-heading">
        <h2>{expanded ? "Review your screening" : "Your stamps"}</h2>
        <span className="count">{stamps.length || ""}</span>
      </header>
      {expanded && (
        <div className="filters" role="group" aria-label="Filter reactions">
          {["all", ...Object.keys(KINDS)].map((kind) => (
            <button
              key={kind}
              className={filter === kind ? "selected" : ""}
              onClick={() => setFilter(kind)}
            >
              {kind === "all" ? "All stamps" : KINDS[kind].label}
            </button>
          ))}
        </div>
      )}
      {stamps.length === 0 ? (
        <div className="empty-stamps">
          <Icon name="stamp" size={55} />
          <h3>Mark the moments that matter.</h3>
          <p>Your feedback will appear here as you watch.</p>
        </div>
      ) : (
        <div className="stamp-scroll">
          {shown.length === 0 ? (
            <p className="muted empty-filter">
              No stamps with this reaction yet.
            </p>
          ) : (
            shown.map((s) => (
              <article className={`stamp-row ${s.kind}`} key={s.id}>
                <div className="stamp-row-top">
                  <button
                    className="stamp-jump"
                    onClick={() => onSeek?.(s.time)}
                    disabled={!onSeek}
                    aria-label={`Jump to ${timecode(s.time)}, ${KINDS[s.kind].label}`}
                  >
                    <span className="dot" />
                    <time>{timecode(s.time)}</time>
                    <strong>{KINDS[s.kind].label}</strong>
                  </button>
                  {!readOnly && (
                    <button
                      className="icon-button small"
                      aria-label={`Delete stamp at ${timecode(s.time)}`}
                      onClick={() => onRemove(s.id)}
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  )}
                </div>
                {s.note && <p className="stamp-note">{s.note}</p>}
                {!readOnly && (
                  <button className="note-button" onClick={() => onEdit(s)}>
                    <Icon name="edit" size={14} />
                    {s.note ? "Edit note" : "Add a note"}
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
