import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final authStateProvider = StreamProvider<AuthState>((ref) {
  return Supabase.instance.client.auth.onAuthStateChange;
});

final sessionProvider = Provider<Session?>((ref) {
  ref.watch(authStateProvider);
  return Supabase.instance.client.auth.currentSession;
});

class AuthController {
  final SupabaseClient _db = Supabase.instance.client;
  Future<void> signIn(String email, String password) =>
      _db.auth.signInWithPassword(email: email, password: password);
  Future<void> signOut() => _db.auth.signOut();
}

final authControllerProvider = Provider((_) => AuthController());
