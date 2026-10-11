// One 2D world (BioreactorScene, 1500 × 1000): overview → fan intake → thin film → column and outlet →
// sensor, LoRa, and cloud. Hermite tangents (Catmull-Rom) make the camera turn continuously.
const anchors = [[.667, .477], [.62, .47], [.657, .72], [.70, .42], [.70, .2]]
const tangents = [[-.047, -.007], [-.005, .12], [.04, -.025], [.02, -.26], [0, -.22]]
const desktopZoom = [1, 2.3, 2.1, 2, 1.45]
const mobileZoom = [1.15, 2.2, 2.1, 2, 1.6]

export function airCamera(progress: number, mobile: boolean) {
  const distance = Math.max(0, Math.min(1, progress)) * 4
  const index = Math.min(3, Math.floor(distance))
  const t = distance - index
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
  const h10 = t ** 3 - 2 * t ** 2 + t
  const h01 = -2 * t ** 3 + 3 * t ** 2
  const h11 = t ** 3 - t ** 2
  const coordinates = [0, 1].map(axis => h00 * anchors[index][axis] + h10 * tangents[index][axis] + h01 * anchors[index + 1][axis] + h11 * tangents[index + 1][axis])
  const zooms = mobile ? mobileZoom : desktopZoom
  const eased = t * t * (3 - 2 * t)
  return { x: coordinates[0], y: coordinates[1], zoom: zooms[index] + (zooms[index + 1] - zooms[index]) * eased }
}
