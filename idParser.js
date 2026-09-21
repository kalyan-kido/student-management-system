function parseUniversityId(id) {
  // Expected format: 23 Q7 1A 05 I5
  //                  YY CC TT BB RR

  if (!id || id.length !== 10) {
    throw new Error('Invalid university ID format. Expected 10 characters, e.g. 23Q71A05I5');
  }

  const yearDigits = id.substring(0, 2);      // "23"
  const collegeCode = id.substring(2, 4);     // "Q7"
  const admissionType = id.substring(4, 6);   // "1A" or "5A"
  const branchCode = id.substring(6, 8);      // "05"
  const rollSuffix = id.substring(8, 10);     // "I5"

  const joiningYear = 2000 + parseInt(yearDigits, 10); // "23" → 2023

  let admissionLabel;
  if (admissionType === '1A') admissionLabel = 'Regular';
  else if (admissionType === '5A') admissionLabel = 'Lateral';
  else admissionLabel = 'Unknown';

  return {
    universityId: id,
    joiningYear,
    collegeCode,
    admissionType: admissionLabel,
    branchCode,
    rollSuffix
  };
}

module.exports = parseUniversityId;