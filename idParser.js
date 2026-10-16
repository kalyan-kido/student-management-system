function parseUniversityId(id, today = new Date()) {
  // Expected format: 23 Q7 1A 05 I5
  //                  YY CC TT BB RR

  if (!id || id.length !== 10) {
    throw new Error('Invalid university ID format. Expected 10 characters, e.g. 23Q71A05I5');
  }

  const yearDigits = id.substring(0, 2);
  const collegeCode = id.substring(2, 4);
  const admissionType = id.substring(4, 6);
  const branchCode = id.substring(6, 8);
  const rollSuffix = id.substring(8, 10);

  const joiningYear = 2000 + parseInt(yearDigits, 10);

  // Regular students start in 1st year (4-year course).
  // Lateral students join directly in 2nd year (3-year course).
  let admissionLabel;
  let startingStudyYear;
  let graduationYear;

  if (admissionType === '1A') {
    admissionLabel = 'Regular';
    startingStudyYear = 1;
    graduationYear = joiningYear + 4;
  } else if (admissionType === '5A') {
    admissionLabel = 'Lateral';
    startingStudyYear = 2;
    graduationYear = joiningYear + 3;
  } else {
    admissionLabel = 'Unknown';
    startingStudyYear = 1;
    graduationYear = joiningYear + 4;
  }

  // Academic year starts in July.
  // July-December = first semester, January-June = second semester.
  const month = today.getMonth();
  const academicStartYear = month >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const semester = month >= 6 ? 1 : 2;

  const rawYear = academicStartYear - joiningYear + startingStudyYear;
  const ordinals = ['1st', '2nd', '3rd', '4th'];

  let studyYear = null;
  let yearLabel;

  if (rawYear < startingStudyYear) {
    yearLabel = 'Not joined yet';
  } else if (rawYear > 4) {
    yearLabel = 'Graduated';
  } else {
    studyYear = rawYear;
    yearLabel = ordinals[rawYear - 1] + ' Year';
  }

  return {
    universityId: id,
    joiningYear,
    collegeCode,
    admissionType: admissionLabel,
    branchCode,
    rollSuffix,
    graduationYear,
    studyYear,
    yearLabel,
    semester: studyYear ? semester : null,
    semesterLabel: studyYear ? studyYear + '-' + semester : null
  };
}

module.exports = parseUniversityId;
