import React from 'react';

const FollowUpActionContext = React.createContext<((text: string) => void) | null>(null);

export function FollowUpActionProvider({
  onFollowUp,
  children,
}: {
  onFollowUp?: (text: string) => void;
  children: React.ReactNode;
}) {
  return (
    <FollowUpActionContext.Provider value={onFollowUp ?? null}>
      {children}
    </FollowUpActionContext.Provider>
  );
}

export function useFollowUpAction(): ((text: string) => void) | null {
  return React.useContext(FollowUpActionContext);
}
