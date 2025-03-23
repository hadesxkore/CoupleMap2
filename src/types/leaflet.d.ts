declare module 'leaflet' {
  export * from 'leaflet';
  
  export interface Marker {
    setPopupContent(content: string): Marker;
  }
} 