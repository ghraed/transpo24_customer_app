import { Redirect } from 'expo-router';

// Customer accounts authenticate by phone; there is no email reset endpoint.
export default function ForgotPasswordScreen() {
  return <Redirect href="/" />;
}
