import jlosRoute from "../../JLOS/JLOS_route.json";
import busCablecarHotel from "../../JLOS/Bus_Cablecar_Hotel.json";
import mtrToCablecar from "../../JLOS/MTR_to_cablecar.json";
import mtrToWaterfront from "../../JLOS/MTR_to_waterfront.json";
import taxiToCheckin from "../../JLOS/Taxi_to_checkin.json";
import beforeMtrToWf from "../../JLOS/before_mtr_to_wf.json";

export interface SampleRoute {
  id: string;
  label: string;
  route: unknown;
}

export const sampleRoutes: SampleRoute[] = [
  { id: "jlos-route", label: "Current JLOS route", route: jlosRoute },
  { id: "bus-cablecar-hotel", label: "Bus to cable car hotel", route: busCablecarHotel },
  { id: "mtr-to-cablecar", label: "MTR to cable car", route: mtrToCablecar },
  { id: "mtr-to-waterfront", label: "MTR to waterfront", route: mtrToWaterfront },
  { id: "taxi-to-checkin", label: "Taxi to check-in", route: taxiToCheckin },
  { id: "before-mtr-to-wf", label: "Before MTR to waterfront", route: beforeMtrToWf },
];
