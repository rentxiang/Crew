import { createContext, useContext, useRef, useState, useEffect, ReactNode } from "react";
import { startLocationTracking, updateLocation, updateSharingStatus } from "../services/location";
import { Room } from "../services/rooms";

type Coords = { latitude: number; longitude: number };

type LocationSharingContextType = {
  isSharing: boolean;
  coordsRef: React.MutableRefObject<Coords | null>;
  startSharing: (userId: string) => Promise<void>;
  stopSharing: () => void;
  currentRoom: Room | null;
  setCurrentRoom: (room: Room | null) => void;
};

const LocationSharingContext = createContext<LocationSharingContextType | null>(null);

export function LocationSharingProvider({ children }: { children: ReactNode }) {
  const [isSharing, setIsSharing] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const coordsRef = useRef<Coords | null>(null);
  const subRef = useRef<any>(null);

  const userIdRef = useRef<string | null>(null);

  const startSharing = async (userId: string) => {
    if (subRef.current) return;
    userIdRef.current = userId;
    const sub = await startLocationTracking((coords) => {
      coordsRef.current = coords;
      updateLocation(userId, coords.latitude, coords.longitude);
    });
    subRef.current = sub;
    setIsSharing(true);
  };

  const stopSharing = () => {
    subRef.current?.remove();
    subRef.current = null;
    setIsSharing(false);
    if (userIdRef.current) {
      updateSharingStatus(userIdRef.current, false);
    }
  };

  useEffect(() => () => { subRef.current?.remove(); }, []);

  return (
    <LocationSharingContext.Provider
      value={{ isSharing, coordsRef, startSharing, stopSharing, currentRoom, setCurrentRoom }}
    >
      {children}
    </LocationSharingContext.Provider>
  );
}

export function useLocationSharing() {
  const ctx = useContext(LocationSharingContext);
  if (!ctx) throw new Error("useLocationSharing must be used inside LocationSharingProvider");
  return ctx;
}
