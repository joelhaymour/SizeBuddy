export const defaultSizeCharts = {
  tops: {
    regular: {
      name: "Tops - Normal Fit",
      sizes: [
        { size: "XS", height: "5'3\"-5'6\"", weight: "110-140", score: "163-196" },
        { size: "S", height: "5'3\"-5'10\"", weight: "126-165", score: "197-215" },
        { size: "M", height: "5'3\"-6'2\"", weight: "141-185", score: "216-234" },
        { size: "L", height: "5'7\"-6'6\"", weight: "166-210", score: "235-276" },
        { size: "XL", height: "5'11\"-6'6\"", weight: "186-230", score: "277-296" },
        { size: "XXL", height: "6'3\"-6'6\"", weight: "211-270", score: "297-336" }
      ]
    },
    // Slim: shift ranges one size up (L -> XL, etc.)
    slim: {
      name: "Tops - Slim Fit",
      sizes: [
        { size: "XS", height: "5'3\"-5'6\"", weight: "110-140", score: "163-196" }, // baseline
        { size: "S", height: "5'3\"-5'6\"", weight: "110-140", score: "163-196" }, // from XS regular
        { size: "M", height: "5'3\"-5'10\"", weight: "126-165", score: "197-215" }, // from S regular
        { size: "L", height: "5'3\"-6'2\"", weight: "141-185", score: "216-234" },   // from M regular
        { size: "XL", height: "5'7\"-6'6\"", weight: "166-210", score: "235-276" },  // from L regular
        { size: "XXL", height: "5'11\"-6'6\"", weight: "186-230", score: "277-296" }  // from XL regular
      ]
    },
    // Loose: shift ranges one size down (L -> M, etc.)
    loose: {
      name: "Tops - Loose Fit",
      sizes: [
        { size: "XS", height: "5'3\"-5'10\"", weight: "126-165", score: "197-215" }, // from S regular
        { size: "S", height: "5'3\"-6'2\"", weight: "141-185", score: "216-234" },   // from M regular
        { size: "M", height: "5'7\"-6'6\"", weight: "166-210", score: "235-276" },  // from L regular
        { size: "L", height: "5'11\"-6'6\"", weight: "186-230", score: "277-296" }, // from XL regular
        { size: "XL", height: "6'3\"-6'6\"", weight: "211-270", score: "297-336" },  // from XXL regular
        { size: "XXL", height: "6'3\"-6'6\"", weight: "211-270", score: "297-336" }  // cap
      ]
    }
  },
  bottoms: {
    regular: {
      name: "Bottoms - Normal Fit",
      sizes: [
        { size: "XS", waist: "25-27", hip: "33-35" },
        { size: "S", waist: "28-30", hip: "36-38" },
        { size: "M", waist: "31-33", hip: "39-41" },
        { size: "L", waist: "34-36", hip: "42-44" },
        { size: "XL", waist: "37-39", hip: "45-47" },
        { size: "XXL", waist: "40-42", hip: "48-50" }
      ]
    },
    // Slim: shift up one label
    slim: {
      name: "Bottoms - Slim Fit",
      sizes: [
        { size: "XS", waist: "25-27", hip: "33-35" }, // baseline
        { size: "S", waist: "25-27", hip: "33-35" }, // from XS regular
        { size: "M", waist: "28-30", hip: "36-38" }, // from S regular
        { size: "L", waist: "31-33", hip: "39-41" }, // from M regular
        { size: "XL", waist: "34-36", hip: "42-44" }, // from L regular
        { size: "XXL", waist: "37-39", hip: "45-47" } // from XL regular
      ]
    },
    // Loose: shift down one label
    loose: {
      name: "Bottoms - Loose Fit",
      sizes: [
        { size: "XS", waist: "28-30", hip: "36-38" }, // from S regular
        { size: "S", waist: "31-33", hip: "39-41" }, // from M regular
        { size: "M", waist: "34-36", hip: "42-44" }, // from L regular
        { size: "L", waist: "37-39", hip: "45-47" }, // from XL regular
        { size: "XL", waist: "40-42", hip: "48-50" }, // from XXL regular
        { size: "XXL", waist: "40-42", hip: "48-50" } // cap
      ]
    }
  },
  bikinis: {
    top: {
      regular: {
        name: "Bikini Top - Normal Fit",
        sizes: [
          { size: "XS", band_size: "28-34", cup_size: "A-B", relative_size: "28A-34B" },
          { size: "S", band_size: "28-36", cup_size: "B-C", relative_size: "28B-36C" },
          { size: "M", band_size: "30-38", cup_size: "C-D", relative_size: "30C-38D" },
          { size: "L", band_size: "30-42", cup_size: "D-DD", relative_size: "30D-42DD" },
          { size: "XL", band_size: "30-44", cup_size: "DD-DDD", relative_size: "30DD-44DDD" },
          { size: "XXL", band_size: "32-50+", cup_size: "DDD-F", relative_size: "32DDD-50F" }
        ]
      },
      // Slim: shift up one label
      slim: {
        name: "Bikini Top - Slim Fit",
        sizes: [
          { size: "XS", band_size: "28-34", cup_size: "A-B", relative_size: "28A-34B" },
          { size: "S", band_size: "28-34", cup_size: "A-B", relative_size: "28A-34B" }, // from XS
          { size: "M", band_size: "28-36", cup_size: "B-C", relative_size: "28B-36C" }, // from S
          { size: "L", band_size: "30-38", cup_size: "C-D", relative_size: "30C-38D" }, // from M
          { size: "XL", band_size: "30-42", cup_size: "D-DD", relative_size: "30D-42DD" }, // from L
          { size: "XXL", band_size: "30-44", cup_size: "DD-DDD", relative_size: "30DD-44DDD" } // from XL
        ]
      },
      // Loose: shift down one label
      loose: {
        name: "Bikini Top - Loose Fit",
        sizes: [
          { size: "XS", band_size: "28-36", cup_size: "B-C", relative_size: "28B-36C" }, // from S
          { size: "S", band_size: "30-38", cup_size: "C-D", relative_size: "30C-38D" }, // from M
          { size: "M", band_size: "30-42", cup_size: "D-DD", relative_size: "30D-42DD" }, // from L
          { size: "L", band_size: "30-44", cup_size: "DD-DDD", relative_size: "30DD-44DDD" }, // from XL
          { size: "XL", band_size: "32-50+", cup_size: "DDD-F", relative_size: "32DDD-50F" }, // from XXL
          { size: "XXL", band_size: "32-50+", cup_size: "DDD-F", relative_size: "32DDD-50F" }
        ]
      }
    },
    bottom: {
      regular: {
        name: "Bikini Bottom - Normal Fit",
        sizes: [
          { size: "XS", dress_size: "0-2" },
          { size: "S", dress_size: "4-6" },
          { size: "M", dress_size: "8-10" },
          { size: "L", dress_size: "12-14" },
          { size: "XL", dress_size: "16-18" }
        ]
      },
      // Slim: shift up one label
      slim: {
        name: "Bikini Bottom - Slim Fit",
        sizes: [
          { size: "XS", dress_size: "0-2" },
          { size: "S", dress_size: "0-2" }, // from XS
          { size: "M", dress_size: "4-6" },
          { size: "L", dress_size: "8-10" },
          { size: "XL", dress_size: "12-14" },
          { size: "XXL", dress_size: "16-18" }
        ]
      },
      // Loose: shift down one label
      loose: {
        name: "Bikini Bottom - Loose Fit",
        sizes: [
          { size: "XS", dress_size: "4-6" }, // from S
          { size: "S", dress_size: "8-10" }, // from M
          { size: "M", dress_size: "12-14" }, // from L
          { size: "L", dress_size: "16-18" }, // from XL
          { size: "XL", dress_size: "16-18" }, // cap
          { size: "XXL", dress_size: "16-18" }
        ]
      }
    }
  },
  dresses: {
    regular: {
      name: "Dresses - Normal Fit",
      sizes: [
        { size: "XS", dress_size: "0-2" },
        { size: "S", dress_size: "4-6" },
        { size: "M", dress_size: "8-10" },
        { size: "L", dress_size: "12-14" },
        { size: "XL", dress_size: "16-18" },
        { size: "XXL", dress_size: "20-22" }
      ]
    },
    slim: {
      name: "Dresses - Slim Fit",
      sizes: [
        { size: "XS", dress_size: "2-4" },
        { size: "S", dress_size: "6-8" },
        { size: "M", dress_size: "10-12" },
        { size: "L", dress_size: "14-16" },
        { size: "XL", dress_size: "18-20" },
        { size: "XXL", dress_size: "22-24" }
      ]
    },
    loose: {
      name: "Dresses - Loose Fit",
      sizes: [
        { size: "XS", dress_size: "00-0" },
        { size: "S", dress_size: "2-4" },
        { size: "M", dress_size: "6-8" },
        { size: "L", dress_size: "10-12" },
        { size: "XL", dress_size: "14-16" },
        { size: "XXL", dress_size: "18-20" }
      ]
    }
  },
  "Bikini Tops / Bras": {
    regular: {
      name: "Bikini Top - Normal Fit",
      sizes: [
        { size: "XS", band_size: "28-34", cup_size: "A-B", relative_size: "28A-34B" },
        { size: "S", band_size: "28-36", cup_size: "B-C", relative_size: "28B-36C" },
        { size: "M", band_size: "30-38", cup_size: "C-D", relative_size: "30C-38D" },
        { size: "L", band_size: "30-42", cup_size: "D-DD", relative_size: "30D-42DD" },
        { size: "XL", band_size: "30-44", cup_size: "DD-DDD", relative_size: "30DD-44DDD" },
        { size: "XXL", band_size: "32-50+", cup_size: "DDD-F", relative_size: "32DDD-50F" }
      ]
    },
    slim: {
      name: "Bikini Top - Slim Fit",
      sizes: [
        { size: "XS", band_size: "28-34", cup_size: "A-B", relative_size: "28A-34B" },
        { size: "S", band_size: "28-36", cup_size: "B-C", relative_size: "28B-36C" },
        { size: "M", band_size: "30-38", cup_size: "C-D", relative_size: "30C-38D" },
        { size: "L", band_size: "30-42", cup_size: "D-DD", relative_size: "30D-42DD" },
        { size: "XL", band_size: "30-44", cup_size: "DD-DDD", relative_size: "30DD-44DDD" },
        { size: "XXL", band_size: "30-48+", cup_size: "DDD-F", relative_size: "30DDD-48F" }
      ]
    },
    loose: {
      name: "Bikini Top - Loose Fit",
      sizes: [
        { size: "XS", band_size: "28-34", cup_size: "A-B", relative_size: "28A-34B" },
        { size: "S", band_size: "28-36", cup_size: "B-C", relative_size: "28B-36C" },
        { size: "M", band_size: "30-38", cup_size: "C-D", relative_size: "30C-38D" },
        { size: "L", band_size: "30-42", cup_size: "D-DD", relative_size: "30D-42DD" },
        { size: "XL", band_size: "30-44", cup_size: "DD-DDD", relative_size: "30DD-44DDD" },
        { size: "XXL", band_size: "32-50+", cup_size: "DDD-F", relative_size: "32DDD-50F" }
      ]
    }
  }
}; 