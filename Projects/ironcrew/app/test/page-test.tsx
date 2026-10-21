"use client";

import { useState } from 'react';

export default function App() {
  const [content, setContent] = useState('Initial Div Content');

  return (
    <div>
      {/* Action happens outside the div */}
      <OutsideAction onUpdate={setContent} />

      {/* The div that gets updated */}
      <TargetDiv content={content} />
    </div>
  );
}

function OutsideAction({ onUpdate }: { onUpdate: (value: string) => void }) {
  return (
    <button onClick={() => onUpdate('Updated via outside action!')}>
      Click Outside
    </button>
  );
}

function TargetDiv({ content }: { content: string }) {
  return <div>{content}</div>;
}

