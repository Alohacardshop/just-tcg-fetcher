-- Enable password strength and leaked password protection
UPDATE auth.config SET password_min_length = 6;
UPDATE auth.config SET password_required_characters = 'digits,lower,upper,symbols';
UPDATE auth.config SET password_check_hibp = true;