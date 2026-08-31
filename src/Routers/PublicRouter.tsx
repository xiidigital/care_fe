import careConfig from "@careConfig";
import { Redirect, useRoutes } from "raviger";

import { Authenticate } from "@/components/Auth/Authenticate";
import Login from "@/components/Auth/Login";
import ResetPassword from "@/components/Auth/ResetPassword";
import BrowserWarning from "@/components/ErrorPages/BrowserWarning";
import InvalidReset from "@/components/ErrorPages/InvalidReset";
import SessionExpired from "@/components/ErrorPages/SessionExpired";

import FirebaseEmailLinkCallback from "@/pages/Auth/FirebaseEmailLinkCallback";
import KeycloakCallback from "@/pages/Auth/KeycloakCallback";
import { FacilitiesPage } from "@/pages/Facility/FacilitiesPage";
import { FacilityDetailsPage } from "@/pages/Facility/FacilityDetailsPage";
import { LandingPage } from "@/pages/Landing/LandingPage";
import { LicensesPage } from "@/pages/Licenses/Licenses";
import PatientLogin from "@/pages/PublicAppointments/auth/PatientLogin";

export const routes = {
  "/": () =>
    careConfig.disablePatientLogin ? <Redirect to="/login" /> : <LandingPage />,
  "/facilities": () =>
    careConfig.disablePatientLogin ? (
      <Redirect to="/login" />
    ) : (
      <FacilitiesPage />
    ),
  "/facility/:id": ({ id }: { id: string }) =>
    careConfig.disablePatientLogin ? (
      <Redirect to="/login" />
    ) : (
      <FacilityDetailsPage id={id} />
    ),
  "/facility/:facilityId/appointments/:staffId/otp/:page": ({
    facilityId,
    staffId,
    page,
  }: {
    facilityId: string;
    staffId: string;
    page: string;
  }) =>
    careConfig.disablePatientLogin ? (
      <Redirect to="/login" />
    ) : (
      <PatientLogin facilityId={facilityId} staffId={staffId} page={page} />
    ),
  "/login": () => <Login />,

  // ADR-0010 callbacks. They are registered unconditionally so a link that
  // arrives while the provider is off lands on a real page and fails closed
  // with a generic message, rather than falling through to the login form with
  // the provider response still in the address bar. Each callback refuses to
  // do anything without a matching, unexpired, single-use local transaction.
  "/auth/keycloak/workforce/callback": () => (
    <KeycloakCallback principal="workforce" />
  ),
  "/auth/keycloak/patient/callback": () => (
    <KeycloakCallback principal="patient" />
  ),
  "/auth/firebase/email-callback": () => <FirebaseEmailLinkCallback />,
  "/2fa": () => <Authenticate />,
  "/forgot-password": () => <Login forgot={true} />,
  "/password_reset/:token": ({ token }: { token: string }) => (
    <ResetPassword token={token} />
  ),
  "/session-expired": () => <SessionExpired />,
  "/licenses": () => <LicensesPage />,
  "/invalid-reset": () => <InvalidReset />,
};

export default function PublicRouter() {
  const routeResult = useRoutes(routes);

  return (
    <>
      <BrowserWarning />
      {routeResult || <Login />}
    </>
  );
}
