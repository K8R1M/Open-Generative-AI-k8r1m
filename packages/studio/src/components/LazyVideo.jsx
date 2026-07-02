"use client";

import { useEffect, useRef, useState } from "react";

const entries = new Map();
let observer = null;

function getObserver() {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!observer) {
    observer = new IntersectionObserver(
      (items) => {
        items.forEach((item) => {
          const setVisible = entries.get(item.target);
          if (setVisible) setVisible(item.isIntersecting);
        });
      },
      { rootMargin: "200px" },
    );
  }
  return observer;
}

function releaseVideo(node) {
  if (!node) return;
  node.pause();
  node.removeAttribute("src");
  node.load();
}

export default function LazyVideo({ src, className, onClick }) {
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = wrapperRef.current;
    const io = getObserver();
    if (!node || !io) {
      setVisible(true);
      return undefined;
    }
    entries.set(node, setVisible);
    io.observe(node);
    return () => {
      io.unobserve(node);
      entries.delete(node);
    };
  }, []);

  useEffect(() => {
    if (visible) return undefined;
    releaseVideo(videoRef.current);
    return undefined;
  }, [visible]);

  useEffect(() => () => releaseVideo(videoRef.current), []);

  return (
    <div ref={wrapperRef} className={className}>
      {visible ? (
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-cover"
          onClick={onClick}
          controls={false}
          loop
          muted
          playsInline
          preload="metadata"
          onMouseOver={(e) => e.currentTarget.play().catch(() => {})}
          onMouseOut={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
        />
      ) : (
        <div className="h-full w-full bg-black/60" />
      )}
    </div>
  );
}
