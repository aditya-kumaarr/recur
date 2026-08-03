import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#17171A",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            background: "#D8FF3D",
            borderRadius: 4,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
