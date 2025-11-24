//import { useEffect, useRef, useState } from 'react';
import './App.css';

let streams = [
  { id: 1, url: "/hls/stream1/index.m3u8" },
  { id: 2, url: "/hls/stream2/index.m3u8" },
  { id: 3, url: "/hls/stream3/index.m3u8" },
  { id: 4, url: "/hls/stream4/index.m3u8" },
  { id: 5, url: "/hls/stream5/index.m3u8" },
  { id: 6, url: "/hls/stream6/index.m3u8" }
];

function App(){
    return (
    <div className="App">
      <h2>Video Streaming Dashboard Assignment — {streams.length} streams</h2>
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