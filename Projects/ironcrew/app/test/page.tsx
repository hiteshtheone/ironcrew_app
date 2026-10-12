"use client";

import { useState } from 'react';

export default function App() {
  const [content, setContent] = useState('Initial Div Content');
  const val = "test123";

  return (
    <div>
      {/* Pass props correctly */}
      <OutsideAction onUpdate={setContent} val1={val} />

      {/* The div that gets updated */}
      <TargetDiv content={content} />
    </div>
  );
}

// FIX: Added curly braces {} around the arguments to correctly destructure props
function OutsideAction({ onUpdate, val1 }) {
  console.log("OutsideAction component rendered");

  return (
    <button onClick={() => onUpdate(val1)}>
      Click Outside
    </button>
  );
}

function TargetDiv({ content }) {
  return <div>{content}</div>;
}

