import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import io from "socket.io-client";
import VideoTile from "./VideoTile";

const socket = io("http://localhost:8000");

let streams = [
  { id: 1, url: "/hls/stream1/index.m3u8" },
  { id: 2, url: "/hls/stream2/index.m3u8" },
  { id: 3, url: "/hls/stream3/index.m3u8" },
  { id: 4, url: "/hls/stream4/index.m3u8" },
  { id: 5, url: "/hls/stream5/index.m3u8" },
  { id: 6, url: "/hls/stream6/index.m3u8" }
];

function App() {
  const [syncInfo, setSyncInfo] = useState({
    isPlaying: false,
    time: 0,
    lastUpdate: Date.now()
  });

  const syncRef = useRef(syncInfo);

  useEffect(() => {
    syncRef.current = syncInfo;
  }, [syncInfo]);

  // Receive sync updates from backend
  useEffect(() => {
    socket.on("sync-update", (data) => {
      setSyncInfo(data);
    });

    return () => socket.off("sync-update");
  }, []);

  // Controls
  const playAll = () => {
    socket.emit("sync-update", {
      isPlaying: true,
      time: syncRef.current.time,
      lastUpdate: Date.now()
    });
  };

  const pauseAll = () => {
    socket.emit("sync-update", {
      isPlaying: false,
      time: syncRef.current.time,
      lastUpdate: Date.now()
    });
  };

  const restartAll = () => {
    socket.emit("sync-update", {
      isPlaying: false,
      time: 0,
      lastUpdate: Date.now()
    });
  };

  return (
    <div className="App">

      <h2>
        Video Streaming Dashboard — {streams.length} streams
      </h2>

      {/* Global Controls */}
      <div className="controls">
        <button onClick={playAll}>Play All</button>
        <button onClick={pauseAll}>Pause All</button>
        <button onClick={restartAll}>Restart</button>
      </div>

      {/* 3×2 Grid */}
      <div className="grid">
        {streams.map((st) => (
          <VideoTile
            key={st.id}
            id={st.id}
            streamUrl={st.url}
            socket={socket}
            syncInfo={syncInfo}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
