import React, { useEffect } from 'react';

export default function Home(): JSX.Element {
  useEffect(() => {
    window.location.replace('/overview/platform-overview');
  }, []);

  return <main>Redirecting to docs overview...</main>;
}
