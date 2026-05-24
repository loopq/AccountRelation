class Account {
  final String id;
  final String category; // email|apple|ai
  final String? platformId;
  final String name;
  final String? encryptedPassword;
  final String? phone;
  final bool twofaEnabled;
  final String? countryId;
  final String? registerEmailId;
  final String? subscribeAppleId;
  final String? note;
  final String? recoveryEmail;
  final String? encrypted2fa;

  Account({
    required this.id, required this.category, required this.name,
    this.platformId, this.encryptedPassword, this.phone, this.twofaEnabled = false,
    this.countryId, this.registerEmailId, this.subscribeAppleId, this.note,
    this.recoveryEmail, this.encrypted2fa,
  });

  factory Account.fromJson(Map<String, dynamic> j) => Account(
        id: j['id'], category: j['category'], name: j['name'],
        platformId: j['platform_id'], encryptedPassword: j['encrypted_password'],
        phone: j['phone'], twofaEnabled: j['twofa_enabled'] ?? false,
        countryId: j['country_id'], registerEmailId: j['register_email_id'],
        subscribeAppleId: j['subscribe_apple_id'], note: j['note'],
        recoveryEmail: j['recovery_email'], encrypted2fa: j['encrypted_2fa'],
      );

  bool get hasSecret => encryptedPassword != null || encrypted2fa != null;
}
